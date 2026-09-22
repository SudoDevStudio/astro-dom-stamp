export interface ListRef {
  ref: string;
  index: number;
}

export interface Stamp {
  fields: Record<string, string>;
  list?: ListRef;
  /** Which of the owner's strings this marker came from, counted per owner. */
  field?: number;
}
