// Must trip: rounding to places by hand. A whole-number round must not.
export const cents = (x: number) => Math.round(x * 100) / 100
export const whole = (x: number) => Math.round(x)
