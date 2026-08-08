import { z } from "zod";

const finiteCoordinate = z.coerce.number().finite();

/** Query schema for delivery address autocomplete. */
export const autocompleteQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  session_token: z.string().trim().min(1).max(200).optional(),
});

/** Query schema for forward geocoding. */
export const geocodeQuerySchema = z.object({
  address: z.string().trim().min(5).max(500),
});

/** Shared bounded coordinate query for estimate and reverse geocoding. */
export const locationQuerySchema = z.object({
  lat: finiteCoordinate.min(-90).max(90),
  lng: finiteCoordinate.min(-180).max(180),
});
