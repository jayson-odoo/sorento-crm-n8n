# TOPOLOGY — ht-config-form  (`evLuDTO60DBlYkk0`)

- versionId **69b0b256-ecac-4d8b-9512-02f7dc07219a** · activeVersionId **69b0b256-ecac-4d8b-9512-02f7dc07219a** · DRAFT == ACTIVE
- 11 nodes

## Edges
_10 edge groups_

```
ht-config-apply[0] -> ht-config-audit
ht-config-audit[0] -> ht-write-timeout
ht-config-echo[0] -> Form Ending
ht-config-form[0] -> ht-config-apply
ht-readback-enabled[0] -> ht-readback-pilot
ht-readback-pilot[0] -> ht-config-echo
ht-readback-timeout[0] -> ht-readback-enabled
ht-write-enabled[0] -> ht-write-pilot
ht-write-pilot[0] -> ht-readback-timeout
ht-write-timeout[0] -> ht-write-enabled
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **ht-config-apply** ← ht-config-echo, ht-write-enabled, ht-write-pilot, ht-write-timeout
- **ht-readback-enabled** ← ht-config-echo
- **ht-readback-pilot** ← ht-config-echo
- **ht-readback-timeout** ← ht-config-echo

## Zero inbound (orphaned / triggers)

- ht-config-form

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| ht-config-audit | redis | sorento-redis |
| ht-readback-enabled | redis | sorento-redis |
| ht-readback-pilot | redis | sorento-redis |
| ht-readback-timeout | redis | sorento-redis |
| ht-write-enabled | redis | sorento-redis |
| ht-write-pilot | redis | sorento-redis |
| ht-write-timeout | redis | sorento-redis |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| ht-config-apply | 107 |
| ht-config-echo | 42 |
