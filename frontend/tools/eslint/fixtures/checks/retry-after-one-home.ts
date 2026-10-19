// Must trip: the header read by a parser of its own.
export const wait = (res: Response) => Number(res.headers.get('Retry-After'))
