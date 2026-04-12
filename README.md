# NocoBase CLI

NocoBase CLI combines:

- built-in commands for environment management and generic resource access
- runtime-generated commands loaded from your NocoBase application's Swagger schema

This allows the CLI to stay aligned with the target application instead of relying on a fixed command list.

## Install

Install dependencies for local development:

```bash
pnpm install
```

Run in development mode:

```bash
node ./bin/dev.js --help
```

Build the CLI:

```bash
pnpm build
```

Run the built CLI:

```bash
node ./bin/run.js --help
```

After packaging or linking, the executable name is:

```bash
nbctl
```

## Quick Start

Add an environment:

```bash
nbctl env add --name local --base-url http://localhost:13000/api --token <token>
```

Show the current environment:

```bash
nbctl env
```

List configured environments:

```bash
nbctl env list
```

Switch the current environment:

```bash
nbctl env use local
```

Update the runtime command cache from `swagger:get`:

```bash
nbctl env update
nbctl env update -e local
```

Use the generic resource commands:

```bash
nbctl resource list --resource users
nbctl resource get --resource users --filter-by-tk 1
nbctl resource create --resource users --values '{"nickname":"Ada"}'
```

## Runtime Commands

When you execute a runtime command, the CLI will:

1. resolve the target environment
2. read the application's Swagger schema from `swagger:get`
3. generate or reuse a cached runtime command set for that application version
4. execute the requested command

If the `API documentation plugin` is disabled, the CLI will prompt to enable it.

## Environment Selection

Use `-e, --env` to temporarily select an environment:

```bash
nbctl env update -e prod
nbctl resource list --resource users -e prod
```

This does not change the current environment unless you explicitly run:

```bash
nbctl env use <name>
```

## Config Scope

The `env` command supports two config scopes:

- `project`: use `./.nocobase-ctl` in the current working directory
- `global`: use the global `.nocobase-ctl` directory

Use `-s, --scope` to select one explicitly:

```bash
nbctl env list -s project
nbctl env add -s global --name prod --base-url http://example.com/api --token <token>
nbctl env use local -s project
```

If you do not pass `--scope`, the CLI uses automatic resolution:

1. current working directory if `./.nocobase-ctl` exists
2. `NOCOBASE_HOME_CLI`
3. your home directory

## Built-in Commands

Current built-in topics:

- `env`
- `resource`

Check available commands at any time:

```bash
nbctl --help
nbctl env --help
nbctl resource --help
```

## Common Flags

- `-e, --env`: temporary environment selection
- `-s, --scope`: config scope for `env` commands
- `-t, --token`: token override
- `-j, --json-output`: print raw JSON response

Example:

```bash
nbctl env update -e prod -s global
nbctl resource list --resource users -e prod -j
```

## Local Data

The CLI stores its local state in `.nocobase-ctl`, including:

- `config.json`: environment definitions and current selection
- `versions/<version>/commands.json`: cached runtime commands for a generated version
