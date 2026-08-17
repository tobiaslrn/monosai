/**
 * Nominal typing helper.
 *
 * Branded aliases prevent structurally identical identifiers (all UUID strings)
 * from being used interchangeably across entities.
 */
declare const brandTag: unique symbol;

export type Brand<TValue, TBrand extends string> = TValue & {
  readonly [brandTag]: TBrand;
};
