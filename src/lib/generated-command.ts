import {Command, Flags} from '@oclif/core';
import type {Interfaces} from '@oclif/core';
import {executeApiRequest} from './api-client.ts';
import {applyPostProcessor} from './post-processors.ts';
import {registerPostProcessors} from '../post-processors/index.ts';

export interface GeneratedParameter {
  name: string;
  flagName: string;
  in: 'path' | 'query' | 'header' | 'cookie' | 'body';
  required?: boolean;
  description?: string;
  type?: string;
  isArray?: boolean;
  jsonEncoded?: boolean;
  jsonShape?: string;
}

export interface GeneratedOperation {
  moduleName: string;
  moduleDisplayName?: string;
  moduleDescription?: string;
  resourceName?: string;
  logicalResourceName?: string;
  actionName?: string;
  resourceDisplayName?: string;
  resourceDescription?: string;
  commandId: string;
  method: string;
  pathTemplate: string;
  tags?: string[];
  summary?: string;
  description?: string;
  examples: string[];
  parameters: GeneratedParameter[];
  hasBody?: boolean;
  bodyRequired?: boolean;
}

function buildParameterFlag(parameter: GeneratedParameter, options?: { required?: boolean }) {
  const hints: string[] = [parameter.in];
  if (parameter.type === 'object' || parameter.type === 'array' || parameter.jsonEncoded) {
    hints.push('JSON');
  } else if (parameter.isArray) {
    hints.push('repeatable');
  } else if (parameter.type) {
    hints.push(parameter.type);
  }

  const description = [
    `${parameter.description ?? ''}${parameter.description ? ' ' : ''}[${hints.join(', ')}]`.trim(),
    parameter.jsonShape ? `Shape: ${parameter.jsonShape}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  const required = options?.required ?? parameter.required;

  if (parameter.type === 'boolean') {
    return Flags.boolean({
      description,
      ...(required ? {required: true as const} : {}),
    });
  }

  if (parameter.isArray && !parameter.jsonEncoded) {
    return Flags.string({
      description,
      multiple: true,
      ...(required ? {required: true as const} : {}),
    });
  }

  return Flags.string({
    description,
    ...(required ? {required: true as const} : {}),
  });
}

export function createGeneratedFlags(operation: GeneratedOperation): Interfaces.FlagInput<any> {
  const flags: Interfaces.FlagInput<any> = {
    'base-url': Flags.string({
      description: 'NocoBase API base URL, for example http://localhost:13000/api',
    }),
    verbose: Flags.boolean({
      description: 'Show detailed progress output',
      default: false,
    }),
    env: Flags.string({
      char: 'e',
      description: 'Environment name',
    }),
    token: Flags.string({
      char: 't',
      description: 'Bearer token override',
    }),
    'json-output': Flags.boolean({
      char: 'j',
      description: 'Print raw JSON response',
      default: true,
      allowNo: true,
    }),
  };

  for (const parameter of operation.parameters) {
    flags[parameter.flagName] = buildParameterFlag(parameter, {
      // Body flags are an alternative authoring path to --body/--body-file.
      // Enforce required body semantics later in parseBody(), after we know
      // which input mode the user chose.
      required: parameter.in === 'body' ? false : parameter.required,
    });
  }

  if (operation.hasBody) {
    flags.body = Flags.string({
      description: 'JSON request body string',
      exclusive: ['body-file'],
    });
    flags['body-file'] = Flags.string({
      description: 'Path to JSON request body file',
      exclusive: ['body'],
    });
  }

  return flags;
}

export abstract class GeneratedApiCommand extends Command {
  static operation: GeneratedOperation;

  async run(): Promise<void> {
    registerPostProcessors();

    const ctor = this.constructor as typeof GeneratedApiCommand;
    const {flags} = await this.parse(ctor);

    const response = await executeApiRequest({
      envName: flags.env,
      baseUrl: flags['base-url'],
      token: flags.token,
      flags,
      operation: {
        method: ctor.operation.method,
        pathTemplate: ctor.operation.pathTemplate,
        parameters: ctor.operation.parameters,
        hasBody: ctor.operation.hasBody,
        bodyRequired: ctor.operation.bodyRequired,
      },
    });

    if (!response.ok) {
      this.error(`Request failed with status ${response.status}\n${JSON.stringify(response.data, null, 2)}`);
    }

    const processedData = await applyPostProcessor(response.data, {
      flags,
      operation: ctor.operation,
    });

    if (flags['json-output']) {
      this.log(JSON.stringify(processedData, null, 2));
      return;
    }

    this.log(`HTTP ${response.status}`);
  }
}
