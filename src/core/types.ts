export interface ListRef {
  ref: string;
  index: number;
}

export interface Stamp {
  fields: Record<string, string>;
  list?: ListRef;
  /** Which of the owner's values this came from, as a path: `title`, `tags.0`. */
  field?: string;
}
