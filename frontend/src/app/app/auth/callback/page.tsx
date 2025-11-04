import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export default function Page() {
  return (
    <Suspense>
      <CallbackClient />
    </Suspense>
  );
}
