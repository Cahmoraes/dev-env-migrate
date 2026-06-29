## Approach
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

## pmem — suppress loader noise
Every `pmem` call emits 2 stderr lines (HuggingFace warnings) + 2 stdout prefix lines (`semantic_backend_notice=`, `semantic_backend=`).
Always call pmem with noise stripped:
```bash
pmem search "query" 2>/dev/null | grep -v "^semantic_backend"
pmem add "..." 2>/dev/null
pmem sync 2>/dev/null
pmem stats 2>/dev/null
```
