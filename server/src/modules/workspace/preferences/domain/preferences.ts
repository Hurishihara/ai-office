import type { Preferences as PreferencesProps } from "@ai-office/shared";
import { BadRequestError } from "../../../../core/errors.js";

const EMOJI = ["none", "light", "heavy"];
const TEXT_FIELDS = ["tone", "audience", "hashtags", "extra"] as const;
const MAX = 2000;

export class Preferences {
  private constructor(private readonly props: PreferencesProps) {}

  static create(props: PreferencesProps): Preferences {
    const errors: string[] = [];
    for (const f of TEXT_FIELDS) {
      if (typeof props[f] !== "string") errors.push(`${f}: must be a string`);
      else if (props[f].length > MAX) errors.push(`${f}: must be at most ${MAX} characters`);
    }
    if (!EMOJI.includes(props.emoji)) errors.push(`emoji: must be one of ${EMOJI.join(", ")}`);
    if (errors.length) throw new BadRequestError(errors.join("; "));
    return new Preferences({ ...props });
  }

  static defaults(): Preferences {
    return new Preferences({ tone: "", audience: "", emoji: "light", hashtags: "", extra: "" });
  }

  toJSON(): PreferencesProps {
    return { ...this.props };
  }
}
