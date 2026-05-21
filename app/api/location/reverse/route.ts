import { NextResponse } from "next/server";

type NominatimReverseResponse = {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = Number(searchParams.get("latitude"));
  const longitude = Number(searchParams.get("longitude"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Latitude and longitude are required." }, { status: 400 });
  }

  try {
    const reverseUrl = new URL("https://nominatim.openstreetmap.org/reverse");
    reverseUrl.searchParams.set("format", "jsonv2");
    reverseUrl.searchParams.set("lat", String(latitude));
    reverseUrl.searchParams.set("lon", String(longitude));
    reverseUrl.searchParams.set("zoom", "10");
    reverseUrl.searchParams.set("addressdetails", "1");

    const response = await fetch(reverseUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "DayPlannerLocal/0.1 (local development)"
      },
      next: { revalidate: 60 * 60 * 24 }
    });

    if (!response.ok) {
      throw new Error(`Reverse location lookup returned ${response.status}.`);
    }

    const payload = (await response.json()) as NominatimReverseResponse;
    const address = payload.address ?? {};
    const name = address.city || address.town || address.village || address.municipality || address.county;
    if (!name) {
      throw new Error("Reverse location lookup did not return a city.");
    }

    const displayName = [name, address.state, address.country].filter(Boolean).join(", ") || payload.display_name || name;

    return NextResponse.json({
      city: {
        id: `browser-${latitude},${longitude}`,
        name,
        admin1: address.state,
        country: address.country,
        latitude,
        longitude,
        displayName
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve current location.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
