#!/usr/bin/env python3
"""
remap-creds.py — rewrite credential references in workflow JSON to PROD's ids.

Why: `n8n import:workflow` only upserts the workflow row; it never touches the
credentials_entity table. So prod's credential SECRETS are always safe. What
breaks is the *reference* (id+name) stored in each node — local JSON carries
local cred ids, so after import prod nodes say "credential not found" even
though the matching prod credential exists. This resolves every node credential
against PROD's live credentials_entity (by name+type) and writes the prod id in.

It does NOT need or touch secrets. Prod cred metadata (id|name|type) is read
read-only over psql.

Usage:
  remap-creds.py <prod_creds.tsv> <aliases.json> <out_dir> <file.json> [...]

  prod_creds.tsv : lines "id|name|type" (from: psql -tA -F'|'
                   -c 'SELECT id,name,type FROM credentials_entity;')
  aliases.json   : { "<local-cred-name>": "<prod-cred-name>", ... }
                   maps dev-only names (local-*) to their prod equivalent.
                   keys starting with '_' ignored.

Resolution per node credential:
  1. translate name via aliases (local-openai-api-key -> sorento-openai)
  2. find prod cred by (type, translated-name); fall back to (translated-name)
  3. write prod id + prod name into the node
Any reference that can't be resolved is reported UNMAPPED and exit is non-zero
(fail closed) — that prod credential must be created first.
"""
import json, os, sys

def main():
    if len(sys.argv) < 5:
        print(__doc__); sys.exit(2)
    prod_tsv, aliases_path, out_dir, *files = sys.argv[1:]

    by_type_name, by_name = {}, {}
    for line in open(prod_tsv):
        line = line.rstrip("\n")
        if not line: continue
        parts = line.split("|")
        if len(parts) < 3: continue
        cid, name, ctype = parts[0], parts[1], parts[2]
        by_type_name[(ctype, name)] = (cid, name)
        by_name.setdefault(name, (cid, name))

    aliases = {k: v for k, v in json.load(open(aliases_path)).items()
               if not k.startswith("_")}
    os.makedirs(out_dir, exist_ok=True)

    unmapped, changed = {}, 0
    for fp in files:
        wf = json.load(open(fp))
        for node in wf.get("nodes", []):
            for ctype, c in (node.get("credentials") or {}).items():
                want = aliases.get(c.get("name"), c.get("name"))
                hit = by_type_name.get((ctype, want)) or by_name.get(want)
                if hit:
                    if c.get("id") != hit[0]:
                        changed += 1
                    c["id"], c["name"] = hit
                else:
                    unmapped[(ctype, c.get("name"), want)] = \
                        unmapped.get((ctype, c.get("name"), want), 0) + 1
        out = os.path.join(out_dir, os.path.basename(fp))
        with open(out, "w") as f:
            f.write(json.dumps(wf, indent=2, ensure_ascii=False) + "\n")
        print(f"  remapped -> {out}")

    print(f"  rewrote {changed} credential reference(s) to prod ids.")
    if unmapped:
        print("\n!! UNMAPPED credentials — not found in prod credentials_entity:")
        for (ctype, name, want), n in unmapped.items():
            tail = f" (alias->{want})" if want != name else ""
            print(f"     {ctype:24} {name}{tail}   x{n}")
        print("   -> create these credentials in prod (UI), or add an alias, then retry.")
        sys.exit(1)

if __name__ == "__main__":
    main()
