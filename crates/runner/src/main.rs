use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::env;
use std::io::{self, Read, Write};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES: usize = 64 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunnerRequest {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    cwd: Option<String>,
    #[serde(default)]
    env: BTreeMap<String, String>,
    timeout_ms: Option<u64>,
    max_output_bytes: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerResponse {
    ok: bool,
    status: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
    truncated: bool,
    error: Option<String>,
}

fn main() {
    let response = match read_request() {
        Ok(request) => run_request(request),
        Err(error) => RunnerResponse {
            ok: false,
            status: None,
            stdout: String::new(),
            stderr: String::new(),
            timed_out: false,
            truncated: false,
            error: Some(error),
        },
    };

    let mut stdout = io::stdout();
    serde_json::to_writer(&mut stdout, &response).expect("runner response should serialize");
    stdout.write_all(b"\n").expect("runner response newline should write");
}

fn read_request() -> Result<RunnerRequest, String> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| format!("failed to read stdin: {error}"))?;

    serde_json::from_str(&input).map_err(|error| format!("invalid runner request JSON: {error}"))
}

fn run_request(request: RunnerRequest) -> RunnerResponse {
    if request.command.trim().is_empty() {
        return error_response("command must not be blank");
    }

    if request.command.contains('/') || request.command.contains('\\') {
        return error_response("command must be an executable name, not a path");
    }

    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS).max(1));
    let max_output_bytes = request.max_output_bytes.unwrap_or(DEFAULT_MAX_OUTPUT_BYTES).max(1);
    let mut command = Command::new(&request.command);
    command
        .args(&request.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(cwd) = request.cwd.as_deref() {
        command.current_dir(cwd);
    }

    command.env_clear();
    command.env("PATH", env::var("PATH").unwrap_or_default());

    for (key, value) in request.env {
        if is_safe_env_key(&key) {
            command.env(key, value);
        }
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => return error_response(&format!("failed to spawn command: {error}")),
    };
    let started = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                return collect_output(child, false, max_output_bytes);
            }
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                return collect_output(child, true, max_output_bytes);
            }
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                let _ = child.kill();
                return error_response(&format!("failed while waiting for command: {error}"));
            }
        }
    }
}

fn collect_output(
    child: std::process::Child,
    timed_out: bool,
    max_output_bytes: usize,
) -> RunnerResponse {
    match child.wait_with_output() {
        Ok(output) => {
            let (stdout, stdout_truncated) = truncate_utf8(output.stdout, max_output_bytes);
            let (stderr, stderr_truncated) = truncate_utf8(output.stderr, max_output_bytes);

            RunnerResponse {
                ok: output.status.success() && !timed_out,
                status: output.status.code(),
                stdout,
                stderr,
                timed_out,
                truncated: stdout_truncated || stderr_truncated,
                error: None,
            }
        }
        Err(error) => error_response(&format!("failed to collect command output: {error}")),
    }
}

fn truncate_utf8(bytes: Vec<u8>, max_output_bytes: usize) -> (String, bool) {
    let truncated = bytes.len() > max_output_bytes;
    let slice = if truncated {
        &bytes[..max_output_bytes]
    } else {
        &bytes
    };

    (String::from_utf8_lossy(slice).into_owned(), truncated)
}

fn is_safe_env_key(key: &str) -> bool {
    !key.is_empty()
        && key
            .bytes()
            .all(|byte| byte == b'_' || byte.is_ascii_uppercase() || byte.is_ascii_digit())
}

fn error_response(message: &str) -> RunnerResponse {
    RunnerResponse {
        ok: false,
        status: None,
        stdout: String::new(),
        stderr: String::new(),
        timed_out: false,
        truncated: false,
        error: Some(message.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_blank_commands() {
        let response = run_request(RunnerRequest {
            command: " ".to_string(),
            args: vec![],
            cwd: None,
            env: BTreeMap::new(),
            timeout_ms: None,
            max_output_bytes: None,
        });

        assert!(!response.ok);
        assert_eq!(response.error.as_deref(), Some("command must not be blank"));
    }

    #[test]
    fn rejects_path_commands_to_avoid_shell_like_execution() {
        let response = run_request(RunnerRequest {
            command: "/bin/echo".to_string(),
            args: vec!["hello".to_string()],
            cwd: None,
            env: BTreeMap::new(),
            timeout_ms: None,
            max_output_bytes: None,
        });

        assert!(!response.ok);
        assert_eq!(
            response.error.as_deref(),
            Some("command must be an executable name, not a path")
        );
    }

    #[test]
    fn truncates_output_at_the_configured_limit() {
        let (value, truncated) = truncate_utf8(b"abcdef".to_vec(), 3);

        assert_eq!(value, "abc");
        assert!(truncated);
    }

    #[test]
    fn filters_environment_keys() {
        assert!(is_safe_env_key("MUSE_RUNNER"));
        assert!(is_safe_env_key("KEY_1"));
        assert!(!is_safe_env_key("Path"));
        assert!(!is_safe_env_key("BAD-NAME"));
    }
}

