/** Where an owner object sat, when it was an item of an array of owners. */
export interface ListRef {
  /** Short id for the array itself, stable for the lifetime of one encode run. */
  ref: string;
  index: number;
}

/** What one marker carries: the read-key values, plus list position if any. */
export interface Stamp {
  /** read key -> its value, stringified. Only keys the object actually had. */
  fields: Record<string, string>;
  list?: ListRef;
}
