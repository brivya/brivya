# @brivya/adapter-wechat-ai

Reference WeChat AI traffic-platform DistributionProfile implementation.

It demonstrates projection of canonical Brivya capabilities and SemanticExperience into a WeChat-style Skill package containing:

```text
SKILL.md
mcp.json
apis/runtime-bridge.json
components/*
app-registration.patch.json
```

Safety boundaries:

- platform identity is identity context only;
- client-supplied identity is not authorization evidence;
- UI confirmation never replaces Brivya ApprovalRecord;
- production mutations remain governed by the canonical BusinessRuntime when Brivya is the business execution authority.

This is a reference generator/conformance baseline, not a promise that current WeChat platform fields or publication APIs are stable. Platform-specific requirements must be verified against official documentation before publication.
