"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import LangSwitch from "@/components/LangSwitch";
import UIIcon from "@/components/UIIcon";
import { SPECIES_MAP } from "@/content/species";
import { useGameStore } from "@/lib/store";

const HERO_SPIRITS = ["bkt-grandmaster", "laksa-dragon", "nasi-lemak-general"];

export default function LandingPage() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const { onboardingDone, loggedIn } = useGameStore();

  useEffect(() => {
    if (loggedIn) router.replace("/map");
  }, [loggedIn, router]);

  const startHref = onboardingDone ? "/login" : "/onboarding";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Background */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <img
          src="/images/hero-hawker-night.webp"
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          draggable={false}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0.25), rgba(26,14,4,0.95))",
          }}
        />
      </div>

      {/* Border frame — fills entire screen, width & height adaptive */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          border: "8px solid transparent",
          borderImage:
            "repeating-linear-gradient(45deg, #a35a33 0 8px, #e3d0a8 8px 10px, #3d7fc1 10px 18px, #e3d0a8 18px 20px) 8",
        }}
      >
        {/* Inner content — flex distributes space, nothing overflows */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "space-between",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img
                src="/icons/icon-192.png"
                alt=""
                style={{ height: "32px", width: "32px", borderRadius: "8px" }}
              />
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 900,
                  color: "#e8c860",
                  textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                }}
              >
                Hawker Hunt
              </span>
            </div>
            <LangSwitch />
          </div>

          {/* Headline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              padding: "8px 20px",
              flexShrink: 0,
            }}
          >
            <h1
              style={{
                fontSize: "26px",
                fontWeight: 900,
                lineHeight: 1.1,
                color: "#fff",
                textShadow: "0 2px 10px rgba(0,0,0,0.8)",
                margin: 0,
              }}
            >
              {t("app.tagline")}
            </h1>
            <p
              style={{
                borderRadius: "999px",
                background: "rgba(0,0,0,0.4)",
                padding: "3px 14px",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.2em",
                color: "#e8c860",
                margin: 0,
              }}
            >
              — {t("app.subTagline")} —
            </p>
          </div>

          {/* Characters */}
          <div
            style={{
              display: "flex",
              width: "100%",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: "2px",
              padding: "8px 4px",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {HERO_SPIRITS.map((id, i) => (
              <div
                key={id}
                className="float-bob"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  animationDelay: `${i * 0.45}s`,
                }}
              >
                <img
                  src={`/spirits/full/${id}.webp`}
                  alt={SPECIES_MAP[id].name[locale]}
                  style={{
                    maxHeight: i === 1 ? "480px" : "384px",
                    maxWidth: "100%",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.6))",
                  }}
                  draggable={false}
                />
                <span
                  style={{
                    marginTop: "4px",
                    borderRadius: "999px",
                    background: "rgba(0,0,0,0.55)",
                    padding: "2px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {SPECIES_MAP[id].name[locale]}
                </span>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              width: "100%",
              padding: "8px 24px 16px",
              flexShrink: 0,
            }}
          >
            <Link
              href={startHref}
              className="btn-gold"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "14px 28px",
                fontSize: "18px",
                fontWeight: 900,
                borderRadius: "999px",
              }}
            >
              <UIIcon name="chopsticks" size={24} /> {t("common.start")}
            </Link>
            <Link
              href="/onboarding"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "999px",
                border: "2px solid rgba(232,200,96,0.7)",
                background: "rgba(0,0,0,0.35)",
                padding: "10px 28px",
                fontSize: "14px",
                fontWeight: 700,
                color: "#e8c860",
              }}
            >
              {t("common.learnMore")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
