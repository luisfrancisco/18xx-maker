import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

import { keys, map } from "ramda";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const allUnits = {
  inches: 100.0,
  mm: 3.937007874,
};

// Config dimensions are stored as whole hundredths of an inch (the schema
// requires an integer), so a converted value has to be rounded before it goes
// back out. Without this, anything entered in mm lands on a fraction -- 240mm
// becomes 944.8818897599999 -- and fails schema validation.
const toConfig = (displayValue, units) =>
  Math.round(displayValue * allUnits[units]);

// Converting the other way leaves a floating point tail of its own (850 units
// reads back as 215.9000000008636 mm), so trim it for display. Two decimals is
// finer than one stored unit in either direction, so this still round-trips.
const toDisplay = (configValue, units) =>
  Math.round((configValue / allUnits[units]) * 100) / 100;

// Component to help input units
const UnitInput = ({ name, value, label, onChange, errorValidation }) => {
  let [error, setError] = useState(false);
  let [units, setUnits] = useState("mm");
  let [internalValue, setInternalValue] = useState(toDisplay(value, units));

  const isError = error || errorValidation;

  // The stored config value is only ever a round-tripped approximation of
  // what was typed (240mm becomes 945 units, which reads back as 240.03mm),
  // so once that rounded value comes back around as the `value` prop, it
  // would otherwise silently correct what the user typed on screen. Skip
  // that resync when the incoming value is the one this input itself just
  // sent, so what was typed stays displayed; a value arriving for any other
  // reason (switching games, another field, the initial mount) still syncs.
  const lastSentConfigValue = useRef(null);

  useEffect(() => {
    if (lastSentConfigValue.current === value) {
      return;
    }

    setInternalValue(toDisplay(value, units));
  }, [value, units]);

  let handler = (event) => {
    setInternalValue(event.target.value);

    let numberValue = Number(event.target.value);
    if (Number.isNaN(numberValue)) {
      if (!error) {
        setError(true);
      }
      return;
    } else {
      if (error) {
        setError(false);
      }
    }

    let configValue = toConfig(numberValue, units);
    lastSentConfigValue.current = configValue;
    onChange(configValue);
  };

  let unitsHandler = (newValue) => {
    setUnits(newValue);
    setInternalValue(toDisplay(value, newValue));
  };

  const className = clsx({ "border-error": isError });
  const numberClassName = clsx(className, "w-20");
  const unitClassName = clsx(className, "w-24");

  return (
    <div className="">
      <Label className="w-min text-lg" htmlFor={name}>
        {label}
      </Label>
      <div className="flex flex-row gap-2 my-1 justify-start items-center">
        <Input
          id={name}
          name={name}
          value={internalValue}
          onChange={handler}
          className={numberClassName}
        />
        <Select onValueChange={unitsHandler} value={units}>
          <SelectTrigger className={unitClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {map(
              (key) => (
                <SelectItem key={key} value={key}>
                  {key}
                </SelectItem>
              ),
              keys(allUnits),
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default UnitInput;
