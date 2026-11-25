import type { Settings as SettingsProps } from "@ai-office/shared";
import { BadRequestError } from "../../../../core/errors.js";

const FIELDS = ["writerModel", "qaModel"] as const;

export class Settings {
  private constructor(private readonly props: SettingsProps) {}

  static create(props: SettingsProps): Settings {
    const errors: string[] = [];
    for (const f of FIELDS) {
      if (typeof props[f] !== "string") errors.push(`${f}: must be a string`);
      else if (props[f].length === 0) errors.push(`${f}: must not be empty`);
    }
    if (errors.length) throw new BadRequestError(errors.join("; "));
    // pick explicitly so extra keys never reach responses or the saved file
    return new Settings({ writerModel: props.writerModel, qaModel: props.qaModel });
  }

  toJSON(): SettingsProps {
    return { ...this.props };
  }
}
