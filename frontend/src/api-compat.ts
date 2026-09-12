// What binds the hand-written wire types to the API they describe (issue #154).
//
// `types.ts` mirrors the backend's Pydantic models by hand, which reads better
// at every call site than the generated names do and drifts the moment someone
// renames a field on the other side. `api-schema.d.ts` is generated from the
// committed `backend/openapi.json` (`npm run generate:api`, and CI fails a
// stale copy), so this file is the only place the two meet: every assertion
// below fails the typecheck when the schema moves out from under the mirror.
//
// It cannot catch everything, and the issue is explicit about that: a request
// that simply never sends an optional field is still legal TypeScript. What it
// does catch is a renamed, retyped, removed or newly required field, a changed
// enum member, and a schema the frontend has never looked at.
//
// Read the direction of each assertion as the direction the data travels. A
// REQUEST must be something the server accepts, so the app's type is asserted
// assignable to the schema's. A RESPONSE must be something the app can read,
// so the schema's type is asserted assignable to the app's. Where only one
// direction is honest, the comment says why.
import type { components } from './api-schema'
import type { PreviewInfo } from './hooks/usePreview'
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  DestinationResult,
  DestinationType,
  DestinationsRequest,
  DestinationsResponse,
  DiscoveredDestination,
  DiscoveryType,
  HourlySeries,
  RefusalFields,
  SortBy,
} from './types'

type Schema = components['schemas']

/**
 * Fails the typecheck when T is not `true`. The diagnostic is TypeScript's own
 * ("Type 'false' does not satisfy the constraint 'true'"), so the name each
 * assertion is declared under is what says which promise broke.
 */
type Assert<T extends true> = T

/** Assignability, tuple-wrapped so a union or `never` is compared whole. */
type Extends<A, B> = [A] extends [B] ? true : false

/**
 * Mutual assignability — the standard invariant-position trick, which is
 * stricter than `Extends` both ways: it separates `string` from a union of
 * string literals, so a dropped enum member cannot pass.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

/**
 * Fields the browser fills in itself, which therefore have no schema to match.
 *
 * `series_times` pins a searched place's own forecast onto the active grid,
 * and `wind_dir_deg` is the bearing the map's playback arrows read: the
 * backend fetches neither, because nothing it computes uses them. Named once
 * and dropped wherever they appear, so the exemption is one list rather than
 * an `Omit` at each assertion that could quietly grow.
 */
type ClientOnly = 'series_times' | 'wind_dir_deg'

/**
 * A type as it travels on the wire: client-only fields dropped, and every
 * remaining property required, at every depth.
 *
 * Optionality is deliberately not compared, because the two sides mean
 * different things by `?`. FastAPI leaves a field out of `required` whenever
 * its model gives it a default, while the serializer emits it regardless — so
 * a response field the app can safely rely on still reads as optional in the
 * schema. Levelling both sides compares the value types, which is where a
 * rename or a retype shows up; the `*FieldsExist` assertions are what hold the
 * key sets themselves together.
 *
 * `-?` drops the optional marker; `Exclude<…, undefined>` is what drops the
 * `| undefined` it leaves behind, which a mapped type only does on its own when
 * it maps `keyof T` whole and this one subtracts from it.
 */
type Wire<T> = T extends (infer E)[]
  ? Wire<E>[]
  : T extends object
    ? { [K in Exclude<keyof T, ClientOnly>]-?: Wire<Exclude<T[K], undefined>> }
    : T

// ---------------------------------------------------------------------------
// Enumerations. Both directions, so a renamed member fails from either side.
// ---------------------------------------------------------------------------

export type SortKeysMatchTheSchema = Assert<Equal<SortBy, Schema['SortBy']>>

export type DestinationTypesMatchTheSchema = Assert<
  Equal<DestinationType, Schema['DestinationType']>
>

// `custom` is the wire form of a CSV-only request rather than something
// discovery can find, so it is the one member the picker never offers. A type
// added to the backend enum lands here first, which is the reminder the
// add-destination-type checklist is for.
export type DiscoveryTypesAreTheRest = Assert<
  Equal<DiscoveryType, Exclude<Schema['DestinationType'], 'custom'>>
>

// ---------------------------------------------------------------------------
// Requests: what the app sends must be what the route accepts.
// ---------------------------------------------------------------------------

export type AnalyzeRequestFieldsExist = Assert<
  Extends<keyof AnalyzeRequest, keyof Schema['AnalyzeRequest']>
>

// `forecast_model` is the one field the app deliberately types wider than the
// schema: the ids come from GET /api/capabilities at runtime, so the picker
// must be able to send an id this build's snapshot does not list. The honest
// assertion is the other way round — every id the schema names is a value the
// request accepts — and it is what fails if the field ever stops being a
// string.
export type AnalyzeRequestIsAccepted = Assert<
  Extends<Omit<AnalyzeRequest, 'forecast_model'>, Omit<Schema['AnalyzeRequest'], 'forecast_model'>>
>

export type ForecastModelIdsAreSendable = Assert<
  Extends<Schema['ForecastModel'], AnalyzeRequest['forecast_model']>
>

export type DestinationsRequestFieldsExist = Assert<
  Extends<keyof DestinationsRequest, keyof Schema['DestinationsRequest']>
>

export type DestinationsRequestIsAccepted = Assert<
  Extends<DestinationsRequest, Schema['DestinationsRequest']>
>

// ---------------------------------------------------------------------------
// Responses: what the route returns must be what the app can read.
// ---------------------------------------------------------------------------

export type AnalyzeResponseFieldsExist = Assert<
  Extends<keyof AnalyzeResponse, keyof Schema['AnalyzeResponse']>
>

export type AnalyzeResponseIsReadable = Assert<
  Extends<Wire<Schema['AnalyzeResponse']>, Wire<AnalyzeResponse>>
>

export type DestinationResultFieldsExist = Assert<
  Extends<Exclude<keyof DestinationResult, ClientOnly>, keyof Schema['DestinationResult']>
>

export type DestinationResultIsReadable = Assert<
  Extends<Wire<Schema['DestinationResult']>, Wire<DestinationResult>>
>

export type HourlySeriesFieldsExist = Assert<
  Extends<Exclude<keyof HourlySeries, ClientOnly>, keyof Schema['HourlySeries']>
>

export type HourlySeriesIsReadable = Assert<
  Extends<Wire<Schema['HourlySeries']>, Wire<HourlySeries>>
>

export type DestinationsResponseFieldsExist = Assert<
  Extends<keyof DestinationsResponse, keyof Schema['DestinationsResponse']>
>

export type DestinationsResponseIsReadable = Assert<
  Extends<Wire<Schema['DestinationsResponse']>, Wire<DestinationsResponse>>
>

export type DiscoveredDestinationFieldsExist = Assert<
  Extends<keyof DiscoveredDestination, keyof Schema['DiscoveredDestination']>
>

export type DiscoveredDestinationIsReadable = Assert<
  Extends<Wire<Schema['DiscoveredDestination']>, Wire<DiscoveredDestination>>
>

export type PreviewConfigMatchesTheBanner = Assert<Equal<PreviewInfo, Schema['PreviewConfig']>>

export type ConfigResponseCarriesThePreview = Assert<
  Extends<Wire<Schema['ConfigResponse']>['preview'], PreviewInfo>
>

// ---------------------------------------------------------------------------
// Error bodies. `readErrorBody` in useAnalyze.ts reads three shapes off one
// response: a hand-raised error's string `detail`, a validation error's array
// of per-field objects, and the structured refusal fields that ride on an
// over-limit 400.
// ---------------------------------------------------------------------------

export type ErrorDetailIsAString = Assert<Extends<Schema['ErrorResponse']['detail'], string>>

export type RefusalDetailIsAString = Assert<Extends<Schema['AnalysisRefusal']['detail'], string>>

export type ValidationDetailCarriesMessages = Assert<
  Extends<NonNullable<Schema['HTTPValidationError']['detail']>, { msg: string }[]>
>

export type RefusalFieldsExist = Assert<
  Extends<keyof RefusalFields, keyof Schema['AnalysisRefusal']>
>

export type RefusalFieldsAreReadable = Assert<
  Extends<Wire<Pick<Schema['AnalysisRefusal'], keyof RefusalFields>>, Wire<RefusalFields>>
>

// ---------------------------------------------------------------------------
// Capabilities. `useCapabilities.ts` parses this body out of `unknown`, field
// by field, so there is no mirror type to compare — what these assert is what
// that parser assumes, which nothing else checks. A `typeof` guard against a
// renamed or retyped field falls back silently, which is the failure mode
// worth a compile error.
// ---------------------------------------------------------------------------

export type CapabilitiesCarryLimitsAndModels = Assert<
  Extends<
    Schema['CapabilitiesResponse'],
    { limits: Schema['Limits']; forecast_models: Schema['ForecastModelInfo'][] }
  >
>

export type ParsedLimitsAreNumbers = Assert<
  Extends<
    Schema['Limits'],
    { max_destinations: number; max_limit: number; max_polygon_area_km2: number }
  >
>

export type ParsedModelFieldsAreRead = Assert<
  Extends<
    Schema['ForecastModelInfo'],
    {
      id: string
      label: string
      summary: string
      finest_grid_km: number
      forecast_hours: number
      regional: boolean
      default: boolean
    }
  >
>

// The one foreign member the map reads off the fire snapshot: what WFIGS can
// see, so a destination outside it reads N/A rather than all-clear (#256).
export type WildfireCoverageIsPublished = Assert<
  Extends<'coverage', keyof Schema['WildfireCollection']>
>

// ---------------------------------------------------------------------------
// Every schema is accounted for. A model added to the backend fails this until
// it is either asserted above or listed as unmirrored with a reason, which is
// the whole point: the frontend should learn about a new contract from the
// typecheck rather than from a bug report.
// ---------------------------------------------------------------------------

// `CustomDestination` and `GeoPolygon` appear here without an assertion of
// their own: they have no spelling on the wire outside the two request bodies,
// so the request assertions above already compare them.
type Mirrored =
  | 'AnalysisRefusal'
  | 'AnalyzeRequest'
  | 'AnalyzeResponse'
  | 'CapabilitiesResponse'
  | 'ConfigResponse'
  | 'CustomDestination'
  | 'DestinationResult'
  | 'DestinationType'
  | 'DestinationsRequest'
  | 'DestinationsResponse'
  | 'DiscoveredDestination'
  | 'ErrorResponse'
  | 'ForecastModel'
  | 'ForecastModelInfo'
  | 'GeoPolygon'
  | 'HTTPValidationError'
  | 'HourlySeries'
  | 'Limits'
  | 'PreviewConfig'
  | 'SortBy'
  | 'ValidationError'
  | 'WildfireCollection'

type Unmirrored =
  // Attribution for the providers, which the app carries itself in
  // utils/dataSources.ts because NOTICES.md transcribes that file.
  | 'DataSource'
  // The API's own way of saying "a point sample" or "a window". The SPA sends
  // two timestamps and lets the backend normalize them, so it never sets one.
  | 'ForecastMode'
  // Published so an API caller can pace itself. The browser reads the
  // response, not the ceiling.
  | 'RateLimits'
  // Both overlays are drawn straight from GeoJSON, and the schema declares the
  // feature bag free-form, so there is nothing here to hold a property name
  // against. The one exception is the fire coverage member, asserted above.
  | 'SmokeCollection'
  // Build identity, for humans and for the release probe. Nothing in the SPA
  // fetches it.
  | 'VersionResponse'

export type EverySchemaIsAccountedFor = Assert<Equal<keyof Schema, Mirrored | Unmirrored>>
