<p align="center">
  <img src="docs/assets/mascot.svg" alt="Muse 的蓝鸟吉祥物" width="120" />
</p>

# Muse

<p align="center">
  <b>一个会逐渐理解你的生活与工作方式，并学会何时、如何提供帮助的个人 AI。</b><br/>
  <i>本地优先，不绑定模型提供方，也不会把尚未实现的能力说成已经可用。</i>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.ja.md">日本語</a> ·
  <strong>简体中文</strong>
</p>

Muse 不只是办公助手，而是面向一个人的生活与工作的持续型智能体。它的长期方向叫 <strong>Attunement（默契适配）</strong>：不只记住信息，还要学会什么时候适合帮忙、什么时候最好保持安静，以及上一次建议是否真的有用。

第一个可以亲手使用的路径是 <strong>Personal Continuity</strong>。你主动创建一个 <code>life</code> 或 <code>work</code> 主题，并准确关联本地任务和笔记；Muse 只使用这些由你关联的来源，整理“上次做到哪里”和一个安全的下一步。自动识别主题、持续观察以及按时机主动介入仍属于路线图，并非当前能力。

> **现在已经可用：** 个人记忆、有来源依据的召回、本地个人数据存储、受保护的工具与浏览器操作、追踪、检查点，以及第一条由用户明确触发的 Personal Continuity 路径。产品边界见 [Attunement 产品契约](docs/strategy/attunement.md)，交付顺序见 [实施计划](docs/goals/attunement-implementation-plan.md)。

<p align="center"><img src="docs/images/web-home.png" alt="Muse 控制台首页" width="860" /></p>

---

## 📊 用数字看 Muse

下面六张图回答的是六个不同问题。测试数量不能证明智能体对用户有效，受控合成数据也不能冒充真实生活证据。最近一次合格的智能体基线通过了 **10/11** 个能力轴，但总评仍为 **FAILED**；真实个人使用效果仍是 **NOT_PROVEN**。

### 组件效果增量

**定义：** 单独开启某个组件后，该组件对应的测量值发生了多少变化。 **例子：** 对“明天复诊是几点”或“这次设计评审决定了什么”提出同一个问题，比较开启 grounding 前后是否更常引用正确的本地记录；这里使用的是受控语料，不是你的私人笔记。 **怎么看：** 正数只表示这一行的指标在这一项实验中变好；各行的语料、单位不同，不能相加或直接比较大小。 **当前：** 两组受控本地模型语料中的 grounding faithfulness 增量为 **+0.94** 和 **+0.63**，recall correction 增量为 **+0.00**。 **能证明：** 指定的 grounding 组件在对应受控场景中改善了依据一致性。 **不能证明：** Muse 整体更好、某个模型全面胜出，或真实生活中长期有效。

![组件效果增量](docs/benchmarks/evidence-effect-deltas.svg)

来源：[canonical dashboard JSON](docs/benchmarks/evidence-dashboard.json) · 重新生成 <code>pnpm evidence:dashboard:render</code> · 校验 <code>pnpm evidence:dashboard:validate</code>

### 证据覆盖范围

**定义：** 分别展示软件保证、受控合成实验、本地真实运行、个人真实使用等不同证据类别目前积累了多少观测。 **例子：** 医院准备这个生活主题和版本发布这个工作主题都通过软件测试，并不等于两次帮助都让用户受益；用户明确反馈属于另一类证据。 **怎么看：** 每根柱子只能在自己的分母内阅读，不能拿不同类别的柱长互相比高低。 **当前：** 智能体能力轴 **10/11**，raw top-4 同时保留旧信息与修正信息 **8/80**，来源隔离 **10,080/10,080**，organic classification **0/1,000**。 **能证明：** 仓库中确实有支持这些特定检查的证据，也能看出哪些证据仍然缺失。 **不能证明：** 证据条目越多就越有用，或把技术验证直接升级为真实个人效果。

![不同证据类别的覆盖范围](docs/benchmarks/evidence-coverage.svg)

来源：[canonical dashboard JSON](docs/benchmarks/evidence-dashboard.json)

### 生产路径召回

**定义：** 不走测试捷径，直接通过生产代码的 <code>prepareGroundedRecall</code> 边界检查普通问题、无答案问题和信息修正问题。 **例子：** 旧笔记写着“健身房 7 点”，后来的修正笔记写着“改为 6 点”。pair retention 检查两条是否都进入最终上下文，current top-1 检查 6 点那条是否排在最前。 **怎么看：** 每根彩色柱表示一个嵌入模型在 20 个案例中通过了多少个。 **当前：** correction pair retention 分别为 **0/20、0/20、1/20、1/20**，四个模型的 current top-1 都是 **0/20**。 **能证明：** 冻结的 synthetic v1 通过真实 prepare-only seam 时存在可重复的候选保留与排序缺陷。 **不能证明：** 该数据是 held-out 或真实使用证据，也不能说明生成回答质量和智能体整体能力；生成请求数为 0。

![生产路径召回结果](docs/benchmarks/recall-production-path.svg)

来源：[canonical production-path JSON](docs/benchmarks/recall-production-path.json) · 重新运行 <code>pnpm eval:recall-production-path</code> · 校验 <code>pnpm eval:recall-production-path:validate</code>

<details>
<summary><b>详细诊断</b></summary>

### 新鲜度消融实验

**定义：** 对完全相同的 raw top-4 候选，比较原始顺序与 Muse 的新鲜度重排。 **例子：** 如果最新的出差航班记录一开始就没进入四条候选，重排器只能调整收到的旧记录，无法凭空找回缺失的新记录。 **怎么看：** 成对柱子表示同一案例在 raw 与 Muse 两个分支中的结果；不允许用平均值掩盖某个模型的退步。 **当前：** 四个模型的差值都是 0，状态为 **UNCHANGED**；80 个修正观测中有 **72/80** 是 <code>PAIR_MISSING</code>。 **能证明：** 本次测量的主要瓶颈发生在重排之前的 retrieval/MMR pair retention。 **不能证明：** 新鲜度处理永远无效，也不能把这项合成召回组件诊断称作智能体或真实用户评估。

![新鲜度消融实验](docs/benchmarks/recall-freshness-ablation.svg)

来源：[canonical freshness JSON](docs/benchmarks/recall-freshness-ablation.json)

### 候选池诊断

**定义：** 把 <code>topK</code> 从 **4** 扩大到 **8**、**12** 时，旧信息与修正信息是否更容易同时留下。 **例子：** 规划家庭旅行时，同时保留已经取消的旧酒店和刚确认的新酒店，能帮助后续判断区分“曾经考虑过”和“当前有效”；候选架太小可能先丢掉新记录。 **怎么看：** correction pass 必须同时满足 pair retained 和 current source top-1；重复试验只验证稳定性，不会增加独立真相数量。 **当前：** pair retention 通常随 topK 增大，例如 v2-moe 为 5/20 → 13/20 → 17/20；但每个 topK 下 raw 与 Muse 的 current-top1 数量相同。 **能证明：** 候选容量是其中一个瓶颈，扩大候选池可能改善 pair retention。 **不能证明：** 新鲜度重排本身有效、12 是最佳生产配置，或真实个人资料上的正确率。

![候选池诊断](docs/benchmarks/recall-candidate-pool.svg)

来源：[canonical candidate-pool JSON](docs/benchmarks/recall-candidate-pool.json)

### 项目实现面

**定义：** 把公开功能清单、某个历史时点的软件检查以及 live command 是否可用放在一起展示。 **例子：** 支持多种日历连接方式，只说明你有不同适配器可选，不等于 Muse 已经五次成功帮你安排日程。 **怎么看：** 每张卡片的单位都不同；<code>NOT_RUN</code> 是“这个快照中没有执行”的状态，不是得分或失败率。 **当前：** 图中记录 endpoint、package/app、MCP server、模型提供方类别、历史通过测试快照与 live command availability；real-LLM round-trip 为 **NOT_RUN**。 **能证明：** 对应实现面、命令和历史软件检查确实存在。 **不能证明：** 代码规模、功能数或测试数会直接带来用户效果、质量或可靠性。

![项目实现面](docs/benchmarks/evidence-project-surface.svg)

来源：[canonical dashboard JSON](docs/benchmarks/evidence-dashboard.json)

</details>

完整的证据类别与禁止升级规则见 [证据索引](docs/benchmarks/EVIDENCE.md)。canonical JSON 是指标唯一真值；CSV、Markdown 和 SVG 都是经过逐字节校验的派生结果。

**受控合成数据规模：** 这次检查把 6 类测试 × 4 种语言 × 4 个复杂度，分别放进互相独立的 1 千、1 万、10 万和 100 万条语料中；例如用虚构的复诊记录检查能否区分旧时间与修正后的时间，或在笔记没有答案时是否拒绝猜测。合计 **1,111,000 条**记录全部完成生成、序列化、重新读取与 schema 校验，分层抽样的 **768/768 条**通过了具名的 Muse 公共边界和最终不变量。LLM、工具、网络调用均为 0，bulk 数据为 1,338,728,855 bytes，peak RSS 为 429,572,096 bytes，所有者状态保持 byte-stable。修正生成器 fixture 后另行执行的 fresh-seed replay 也通过了 **1,000/1,000 条** schema 校验和 **192/192 条**公共边界，但它明确是 `robustnessReplay=true`、`heldOut=false`，不计入 111.1 万条主结果。它只能证明流式处理、语料完整性、抽样公共边界执行和可重复性，不能证明个人学习、held-out 泛化、organic effectiveness，也不代表执行了 111.1 万次智能体任务。[基准 JSON](docs/benchmarks/eval-datasets-scale-v1.json) · [易读报告](docs/benchmarks/eval-datasets-scale-v1.md)

### 为什么现在使用 Muse

Muse 目前的价值不是替你猜“这件事属于生活还是工作”，而是让你自己建立明确的 <code>life</code> / <code>work</code> 主题，只关联真正需要的本地任务和笔记，并把任何对外动作限制在你的批准范围内。比如回到就诊准备或中断的设计工作时，可以在不混入无关记忆的前提下查看上次进度和一个安全的下一步。

长期真实有用、学会自然介入时机、越用越贴合个人生活，这些仍是 **NOT_PROVEN**。当前可用的是一条由用户掌握主导权、来源可核对、动作受审批约束的明确 Continuity 路径。

---

## ⚡ 安装与快速开始

~~~bash
# 环境要求：Git + Node.js >= 22.12（推荐 Node 24 LTS）+ pnpm 10
git clone https://github.com/wlsdks/muse-agent.git
cd muse-agent
corepack enable
pnpm install:muse
muse onboard
~~~

受支持的源码安装要求干净的 <code>main</code>，会冻结依赖安装、构建 workspace、链接 CLI 并执行验证。用 <code>pnpm install:muse -- --dry-run</code> 预览，用 <code>muse update</code> 更新，或运行 <code>pnpm demo</code> 查看带讲解的本地演示。

主动创建一个 Continuity thread：

~~~bash
muse thread start "准备生日聚会" --kind life
muse thread link <thread-id> note birthday.md --role context
muse thread link <thread-id> task <task-id> --role next-step
muse continue <thread-id>
muse thread outcome <delivery-id> used
~~~

其他常用的本地流程：

~~~bash
muse chat --local --user me
muse status --user me
muse proactive watch --user me --interval 60
~~~

<code>muse ask</code> 会返回带引用依据、且来源可以打开核对的 grounded answer。

<p align="center"><img src="docs/images/cli-ask.png" alt="带引用与可打开来源的 muse ask" width="860" /></p>

---

## 🔧 核心能力

- **不绑定模型提供方的推理层：** 用同一个 <code>ModelProvider</code> 边界连接 OpenAI、Anthropic、Gemini、OpenRouter、Ollama、LM Studio 与 OpenAI-compatible endpoint。
- **Personal Continuity 与记忆：** 明确区分 life/work thread，只使用用户准确关联的本地来源，并保存 outcome、fact、preference、veto 与 goal。
- **有依据的召回：** 本地笔记排序、confidence gate、新鲜度处理和 citation；证据不足时不会给出自信断言。
- **个人工具：** 本地 note、task、reminder、contact，以及五种 calendar backend。
- **受保护的动作：** fail-close guard、fail-open hook、明确 approval、不信任 tool output、有限 loop/timeout 和 trace。
- **一个 runtime：** CLI、API/web chat、messaging、scheduled job 与 delegated worker 共用同一个 composition root。
- **双向 MCP：** 内置 <code>muse.*</code> 工具，同时可通过 <code>muse mcp serve</code> 向其他 agent 提供只读召回、搜索和 user-model access。
- **本地优先：** 文件型个人存储不需要云账号；<code>MUSE_LOCAL_ONLY=true</code> 会拒绝云模型提供方。

## Muse 不会做什么（边界）

- **不会移动资金。** 不连接金融账户，不发起付款或转账。
- **不会自主向第三方发送。** 邮件、聊天、表单和预订都先生成草稿；内容和收件人由你确认。
- **不会暗中猜测 Continuity 归属。** thread 与 source link 由用户创建；自动识别属于未来的 opt-in 工作。
- **只面向一个用户、一个环境。** Muse 不是多租户 workspace，也没有共享账号或 RBAC 产品模型。
- **不会混淆证据类别。** software test、synthetic replay、component diagnostic、agent trial 与 organic outcome 始终分开。

强制执行的边界见 [outbound safety](.claude/rules/outbound-safety.md) 和 [Attunement 设计](docs/design/attunement.md)。

## 🧩 模型提供方与本地运行

通过 <code>MUSE_MODEL=&lt;provider&gt;/&lt;model&gt;</code> 和相应的 API key 环境变量选择 provider。<code>MUSE_MODEL_PROVIDER_ID</code>、<code>MUSE_MODEL_API_KEY</code>、<code>MUSE_MODEL_BASE_URL</code> 可显式覆盖。云 provider 与 <code>MUSE_LOCAL_ONLY=true</code> 不兼容。

使用 Ollama 的免费离线路径：

~~~bash
brew install ollama
ollama serve &
ollama pull gemma4:12b
muse setup local
~~~

个人数据默认保存在本地文件：notes 位于 <code>~/.muse/notes/</code>，tasks 位于 <code>~/.muse/tasks.json</code>，reminders 位于 <code>~/.muse/reminders.json</code>，memory 位于 <code>~/.muse/user-memory.json</code>。<code>muse setup calendar</code> 支持 Local、Local-ICS、Google、CalDAV 与 macOS Calendar。Windows 支持 CLI、API、recall、Ollama 和 opt-in PowerShell actuator；仅限 macOS 的 mirror 会自动停用。

模型档位、许可证、延迟与排错方法见 [本地模型设置](docs/setup-local-llm.md)。

## ✅ 验证

编辑时使用窄范围 gate，合并前运行完整 gate：

~~~bash
pnpm typecheck:fast
pnpm test:changed
pnpm check
pnpm smoke:broad
pnpm smoke:live
~~~

<code>smoke:live</code> 会明确使用本地 Ollama，无法连接时会跳过。耗时更长的 <code>pnpm eval:agent</code> 用于 nightly/manual。最新合格结果是 10 passed、1 failed、0 unverified，也就是 **10/11**；aggregate 仍为 **FAILED**。

## 📖 文档

- [Attunement 产品契约](docs/strategy/attunement.md)
- [Attunement 架构与当前缺口](docs/design/attunement.md)
- [Attunement 实施计划](docs/goals/attunement-implementation-plan.md)
- [系统地图](docs/SYSTEM-MAP.md)
- [已验证功能目录](docs/feature-catalog/INDEX.md)
- [证据索引](docs/benchmarks/EVIDENCE.md)
- [安全说明](SECURITY.md)

## 💬 社区与支持

问题、bug 和功能建议请提交到 [GitHub Issues](https://github.com/wlsdks/Muse/issues)。安全漏洞请按 [SECURITY.md](SECURITY.md) 说明私下报告，不要创建公开 issue。

## 参与贡献

修改仓库前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[CLAUDE.md](CLAUDE.md) 和 [domain rules](.claude/rules/)。请使用 Conventional Commits，并用英文撰写 commit 与 PR 描述。

## 许可证

[MIT](LICENSE)。runtime、adapter 与 tooling 都是开源的，contribution 采用相同条款。
