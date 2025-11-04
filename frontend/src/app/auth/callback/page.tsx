// IMPORTANT: this file must be server-side and do a client redirect wrapper

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

import CallbackClient from "./CallbackClient";

export default function Page() {
  return <CallbackClient />;
}
