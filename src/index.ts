import * as lodashMerge from "lodash.merge";
import { pascalCase } from "change-case";
import * as lodashGet from "lodash.get";

const METHODS = ["get", "put", "delete", "post", "options"];
const PARAMETER_MAP = { header: "headers", query: "query", path: "params" };


function generate(spec: any, options: Options = {}) {
  const defaultOptions: Options = {
    indent: 2,
  };
  options = lodashMerge(defaultOptions, options);
  const { operations, components } = retriveSchema(spec);
  const builder = new Builder(options);
  for (const operationId in operations) {
    builder.build(pascalCase(operationId + "Req"), operations[operationId]);
  }
  for (const name in components) {
    builder.build(pascalCase(name), components[name]);
  }
  return builder.buffer;
}


class Builder {
  public buffer: string = "";
  private options: Options;
  private indent: number = 0;
  private scopes: string[] = [];
  constructor(options: Options) {
    this.options = options;
  }
  public build(name, schema) {
    if (schema.$ref) {
      this.writeln(`export type ${pascalCase(name)} = ${refTail(schema.$ref)}`)
    } else if (schema.type === "object") {
      this.writeln(`export interface ${pascalCase(name)} {`);
      this.enterScope("object");
      this.buildProperties(schema.properties, schema.required)
      this.exiteScope(true);
      this.writeln("\n");
    }
  }
  private buildProperties(properties: any[], required: string[]) {
    for (const name in properties) {
      const optional = required.find(v => v === name) ? "" : "?";
      const schema = properties[name];
      const type = getType(schema)
      if (isScalar(type)) {
        this.writeln(`${name}${optional}: ${type};`)
      } else {
        if (type === "array") {
          const elemSchema = schema.items;
          const type = getType(elemSchema);
          if (isScalar(type)) {
            this.writeln(`${name}${optional}: ${type}[];`)
          } else {
            this.writeln(`${name}${optional}: {`)
            this.enterScope(type);
            this.buildProperties(elemSchema.properties, elemSchema.required)
            this.exiteScope();
          }
        } else {
          this.writeln(`${name}${optional}: {`)
          this.enterScope(type);
          this.buildProperties(schema.properties, schema.required)
          this.exiteScope();
        }
      }
    }
  }
  private enterScope(kind: string) {
    this.scopes.push(kind);
    this.indent += 1;
  }
  private exiteScope(root = false) {
    const kind = this.scopes.pop();
    const semi = root ? "" : ";";
    this.indent -= 1;
    if (kind === "object") {
      this.writeln(`}${semi}`);
    } else {
      this.writeln(`}[]${semi}`)
    }
  }
  private writeln(line) {
    this.buffer += this.spaces() + line + "\n";
  }
  private spaces() {
    return " ".repeat(this.indent * this.options.indent)
  }
}


function retriveSchema(spec: any) {
  const schemas = {} as any;
  for (const path in spec.paths) {
    const pathItem = spec.paths[path];
    for (const method of METHODS) {
      const operation = pathItem[method]; 
      if (!operation) continue;
      if (!operation.operationId) {
        throw new Error(`endpoint ${method.toUpperCase()} ${path} miss operationId`);
      }
      const endpointSchema = createDefaultSchema();
      const addParamaterSchema = (key, obj: any) => {
        const dataKey = PARAMETER_MAP[key];
        if (!dataKey) return;
        let data = endpointSchema.properties[dataKey];
        if (!data) {
          data = endpointSchema.properties[dataKey] = createDefaultSchema();
        }
        if (obj.$ref) {
          const paths = refToPath(obj.$ref);
          if (paths) {
            data.properties[obj.name] = lodashGet(spec, paths.concat("schema"));
          } else {
            data.properties[obj.name] = {};
          }
        } else {
          data.properties[obj.name] = obj.schema;
        }
        if (obj.required) data.required.push(obj.name);
      };
      const parameters: any[] = [...(pathItem.parameters || []), ...(operation.parameters || [])];
      for (const parameter of parameters) {
        addParamaterSchema(parameter.in, parameter);
      }
      const bodySchema = lodashGet(operation, ["requestBody", "content", "application/json", "schema"]);
      if (bodySchema) {
        endpointSchema.properties["body"] = bodySchema;
      }
      schemas[operation.operationId] = endpointSchema;
    }
  }
  return { operations: schemas, components: lodashGet(spec, "components.schemas") };
}


function createDefaultSchema() {
  return { type: "object", properties: {}, required: [] };
}

function refToPath(ref: string) {
  if (ref === "#") return;
  if (!ref.startsWith("#/")) return;
  return ref.slice(2).split("/");
}

function refTail(ref: string) {
  const paths = refToPath(ref);
  if (paths) return paths[paths.length - 1];
  return "any";
}

function isScalar(type: string) {
  return ["object", "array"].indexOf(type) === -1;
}

function getType(shcema: any) {
  switch (shcema.type) {
    case "integer":
      return "number";
    case "number":
    case "string":
    case "boolean":
    case "object":
    case "array":
      return shcema.type
    default:
      if (shcema.properties) {
        return "object";
      } else if (shcema.items) {
        return "array"
      } else if (shcema.$ref) {
        return refTail(shcema.$ref);
      }
      return "any";
  }
}

export interface Options {
  /**
   * Ident with spaces, default value is 2
   */
  indent?: number;
}

export { generate };
