"use client";
import { useRouter } from "next/navigation";
import { configureFrontend } from "@unplan/frontend/runtime";
configureFrontend({
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  useNavigation: useRouter,
});
