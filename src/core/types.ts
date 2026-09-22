export interface ListRef {
  ref: string;
  index: number;
}

export interface Stamp {
  fields: Record<string, string>;
  list?: ListRef;
}
