# lesson-factory Skills

Claude Code / Codex 用の skill 定義群。`lesson-factory` の 6 段改善ループ（intake → draft → critique → media → eval → publish）と、それらを束ねる `lesson-improve` の 7 本を収録する。画像生成は Owner の Codex / ChatGPT サブスクの built-in imagegen を標準動線とし、OpenAI API key は要求しない。

このディレクトリが **source of truth**。ローカルの Claude Code から利用するには、各 skill を `~/.claude/skills/` にシンボリックリンクする:

```bash
for s in lesson-intake lesson-draft lesson-critique lesson-media lesson-eval lesson-publish lesson-improve; do
  ln -sfn "$PWD/lesson-factory/skills/$s" "$HOME/.claude/skills/$s"
done
```

`~/.claude/skills/<name>/` が既にある場合はまず退避してからリンクを張り直すこと。
