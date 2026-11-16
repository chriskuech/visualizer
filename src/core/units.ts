/** Branded unit types, so a lag in ms cannot be passed where a time in seconds is expected. */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Ms = Brand<number, 'Ms'>;
export type Seconds = Brand<number, 'Seconds'>;

export const ms = (v: number): Ms => v as Ms;
export const seconds = (v: number): Seconds => v as Seconds;
export const msToSeconds = (v: Ms): Seconds => (v / 1000) as Seconds;
export const secondsToMs = (v: Seconds): Ms => (v * 1000) as Ms;
