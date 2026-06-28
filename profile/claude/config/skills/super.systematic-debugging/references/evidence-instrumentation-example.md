# Evidence Instrumentation Example (multi-layer system)

Add diagnostic logging at each component boundary, then run once to see which
layer fails. Example for a CI signing pipeline (secrets → workflow → build →
signing):

```bash
# Layer 1: Workflow
echo "=== Secrets available in workflow: ==="
echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"

# Layer 2: Build script
echo "=== Env vars in build script: ==="
env | grep IDENTITY || echo "IDENTITY not in environment"

# Layer 3: Signing script
echo "=== Keychain state: ==="
security list-keychains
security find-identity -v

# Layer 4: Actual signing
codesign --sign "$IDENTITY" --verbose=4 "$APP"
```

**This reveals:** Which layer fails (e.g. secrets → workflow ✓, workflow → build ✗).
