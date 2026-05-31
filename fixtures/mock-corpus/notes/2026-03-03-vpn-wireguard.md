# WireGuard VPN setup (home → office)

Set this up on 2026-03-03 after the office switched to the new firewall.

- Interface MTU: **1380** (1420 dropped large packets over the LTE backup link — 1380 is the value that finally stopped the fragmentation).
- Endpoint: `vpn.office.internal:51820`
- Split tunnel: only `10.20.0.0/16` goes through the tunnel; everything else stays on the local route.
- Keepalive: 25s (NAT on the home router drops idle peers otherwise).

If handshakes stop working after a router reboot, re-pull the peer public key — the office rotates it monthly on the 1st.
