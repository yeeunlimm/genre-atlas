"use client";

import {useEffect, useRef, useState} from "react";
import {ArrowRight, Heart, Music2, Search, X} from "lucide-react";
import {ONBOARDING_KEY, shouldShowOnboarding} from "@/lib/onboarding";
import type {DiscoveryMode} from "@/lib/discovery-navigation";

type Props = {onChoose: (mode: DiscoveryMode) => void; preview?: boolean};

export function DiscoveryOnboarding({onChoose, preview = false}: Props) {
  const [open, setOpen] = useState(preview);
  const replay = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (preview || location.pathname === "/onboarding-preview") {setOpen(true); return;}
    try {
      setOpen(shouldShowOnboarding(new URL(location.href), localStorage.getItem(ONBOARDING_KEY) === "dismissed"));
    } catch {
      // Blocked storage must never prevent music discovery.
      setOpen(shouldShowOnboarding(new URL(location.href), false));
    }
  }, [preview]);

  function dismiss(restoreFocus = true) {
    setOpen(false);
    if (!preview && location.pathname !== "/onboarding-preview") {
      try {localStorage.setItem(ONBOARDING_KEY, "dismissed");} catch { /* Storage is optional. */ }
    }
    if (restoreFocus) requestAnimationFrame(() => replay.current?.focus());
  }

  function choose(mode: DiscoveryMode) {
    dismiss(false);
    onChoose(mode);
  }

  return <div className="welcome-guide">
    <div className="welcome-guide-tools">
      <button ref={replay} type="button" aria-expanded={open} aria-controls="welcome-guide-panel"
        onClick={() => {if (open) dismiss(); else {setOpen(true); requestAnimationFrame(() => heading.current?.focus());}}}>
        {open ? "Hide guide" : "Quick guide"}<span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
    </div>
    {open && <section id="welcome-guide-panel" className="welcome-panel" aria-labelledby="welcome-heading"
      onKeyDown={event => {if (event.key === "Escape") {event.stopPropagation(); dismiss();}}}>
      <div className="welcome-heading-row">
        <div>
          <p className="welcome-eyebrow">WELCOME TO GENRE ATLAS</p>
          <h2 id="welcome-heading" ref={heading} tabIndex={-1}>Find your next <em>favorite.</em></h2>
          <p className="welcome-intro">Start with a name you love. Follow the music from there.</p>
        </div>
        <button type="button" className="welcome-close" aria-label="Dismiss quick guide" onClick={() => dismiss()}><X size={20} aria-hidden="true"/></button>
      </div>
      <div className="welcome-paths">
        <article className="welcome-path">
          <Search size={24} strokeWidth={1.4} aria-hidden="true"/>
          <h3>Start with an artist</h3>
          <p>Search a name, then explore related artists, genres and albums.</p>
          <button type="button" className="welcome-action welcome-action-primary" onClick={() => choose("artist")}>Find an artist <ArrowRight size={17} aria-hidden="true"/></button>
        </article>
        <article className="welcome-path">
          <Music2 size={24} strokeWidth={1.4} aria-hidden="true"/>
          <h3>Start with a song</h3>
          <p>Choose a recording to discover songs connected through credits and more.</p>
          <button type="button" className="welcome-action" onClick={() => choose("song")}>Find a song <ArrowRight size={17} aria-hidden="true"/></button>
        </article>
        <article className="welcome-path">
          <Heart size={24} strokeWidth={1.4} aria-hidden="true"/>
          <h3>Make it yours</h3>
          <p>Log in with Kakao to like songs. Then build a playlist from your likes.</p>
          <button type="button" className="welcome-action" onClick={() => choose("song")}>Find songs to like <ArrowRight size={17} aria-hidden="true"/></button>
        </article>
      </div>
      <div className="welcome-footer"><span>No login needed to explore.</span><button type="button" onClick={() => dismiss()}>Skip for now <ArrowRight size={15} aria-hidden="true"/></button></div>
    </section>}
  </div>;
}
