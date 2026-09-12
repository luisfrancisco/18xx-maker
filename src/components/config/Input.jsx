import clsx from "clsx";
import debounce from "lodash.debounce";
import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";

import { assocPath, map, path, split } from "ramda";

import { Checkbox } from "@/components/ui/checkbox";
import { Input as FormInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import UnitInput from "@/components/config/UnitInput";

import { useConfig, useValidation } from "@/hooks";
import { getPath, getSchema } from "@/util/input";

const Input = ({
  name,
  label,
  options = [],
  description,
  dimension,
  large = false,
}) => {
  const { config, setConfig } = useConfig();
  const { isValidByInputName } = useValidation();
  const value = path(split(".", name), config);

  const error = !isValidByInputName(name);
  const className = clsx({ "border-error": error });

  let valuePath = getPath(name);

  // Typed values are committed once typing pauses. The debounced function
  // has to survive re-renders (a fresh one per render never cancels the last
  // one's timer, so every keystroke used to be committed 800ms later, and the
  // leading edge committed the very first character straight away -- typing
  // a paper width of "85" first applied a page 0.08in wide). It reads the
  // config through a ref so it always merges into the latest one.
  const configRef = useRef(config);
  configRef.current = config;
  const rawUpdateDebounced = useMemo(
    () =>
      debounce(
        (value) =>
          setConfig(assocPath(getPath(name), value, configRef.current)),
        800,
      ),
    [name, setConfig],
  );
  useEffect(() => () => rawUpdateDebounced.cancel(), [rawUpdateDebounced]);

  let update = (value) => {
    setConfig(assocPath(valuePath, value, config));
  };

  let inputSchema = getSchema(name);
  let inputNode = null;

  if (inputSchema && inputSchema.type === "string") {
    const selectOptions = inputSchema.enum
      ? map(
          (value) => ({
            value,
            label: value,
          }),
          inputSchema.enum,
        )
      : options;

    inputNode = (
      <div className="">
        <Label htmlFor={name} className="text-lg">
          {label}
        </Label>
        <Select onValueChange={update} value={value}>
          <SelectTrigger
            id={name}
            name={name}
            className={clsx(large ? "w-48" : "w-32", className)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {map(
              (opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ),
              selectOptions,
            )}
          </SelectContent>
        </Select>
      </div>
    );
  } else if (inputSchema && inputSchema.type === "boolean") {
    const checkClasses = clsx(className, "data-[state=checked]:bg-background");
    inputNode = (
      <div className="flex flex-row justify-start items-center">
        <Checkbox
          id={name}
          name={name}
          checked={value}
          onCheckedChange={update}
          className={checkClasses}
          variant="outline"
        />
        <Label htmlFor={name} className="ml-2 text-lg">
          {label}
        </Label>
      </div>
    );
  } else {
    const numberClasses = clsx(className, "w-20");
    inputNode = dimension ? (
      <UnitInput
        name={name}
        value={value}
        label={label}
        onChange={rawUpdateDebounced}
        errorValidation={error}
      />
    ) : (
      <div className="">
        <Label htmlFor={name} className="text-lg">
          {label}
        </Label>
        <FormInput
          id={name}
          name={name}
          value={value}
          onChange={(e) => rawUpdateDebounced(Number(e.target.value))}
          className={numberClasses}
        />
      </div>
    );
  }

  return (
    <div className="mt-8">
      {inputNode}
      <ReactMarkdown className="text-sm mb-4 mt-1 text-muted-foreground">
        {description}
      </ReactMarkdown>
    </div>
  );
};

export default Input;
