/**
 * AUTO-GENERATED catalog bundle. Do not edit by hand — regenerate via
 * `node --experimental-strip-types scripts/build-text-animation-bundle.ts`
 * (idempotent against the raw JSON in `raw-catalog/specs/` and
 * `raw-catalog/effects/`).
 *
 * Inlining the catalog as a TS module keeps the loader synchronous and
 * environment-agnostic: Vite, `node --experimental-strip-types`, and any
 * future test runner all reach the same data without an import.meta.glob
 * fork.
 */

export interface RawTextEffectCatalog {
	specModules: Record<string, unknown>;
	effectModules: Record<string, unknown>;
}

export const RAW_TEXT_EFFECT_CATALOG: RawTextEffectCatalog = {
	specModules: {
  "blur-out-up": {
    "id": "blur-out-up",
    "display_name": "Blur Out Up",
    "description": "Words arrive clean and depart upward with increasing blur for airy exits.",
    "inspiration": "Apple-style light typography where exit has more character than entry.",
    "target": "per-word",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "enter": {
      "duration_ms": 560,
      "stagger_ms": 28,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "y_px": 10,
        "blur_px": 6
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 480,
      "stagger_ms": 24,
      "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -14,
        "blur_px": 8
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 170,
      "micro_delay_ms": 35
    },
    "usage_notes": "Works best on short phrases; avoid very long lines to keep swap time tight."
  },
  "bottom-up-letters": {
    "id": "bottom-up-letters",
    "display_name": "Bottom-Up Letters",
    "description": "Letters rise from below in a pronounced staircase, one symbol at a time, with zero blur.",
    "inspiration": "Apple-style keynote typography, sharp lower-thirds, and clean editorial word swaps.",
    "target": "per-character",
    "signature_easing": "cubic-bezier(0.18, 1, 0.32, 1)",
    "enter": {
      "duration_ms": 400,
      "stagger_ms": 88,
      "easing": "cubic-bezier(0.18, 1, 0.32, 1)",
      "from": {
        "opacity": 0,
        "y_px": 46
      },
      "to": {
        "opacity": 1,
        "y_px": 0
      }
    },
    "exit": {
      "duration_ms": 280,
      "stagger_ms": 28,
      "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -14
      }
    },
    "swap": {
      "mode": "sequential",
      "overlap_ms": 0,
      "micro_delay_ms": 35,
      "scenario_spec": {
        "entry_condition": "Use when short words or compact headlines should build upward letter by letter with completely crisp glyph edges.",
        "switch_order": [
          "Run old text exit first so the slot clears cleanly.",
          "Wait micro_delay_ms after exit.",
          "Start new text enter from below with per-character stagger."
        ],
        "verification": [
          "Letters never blur during enter or exit.",
          "The reveal clearly reads bottom-up rather than typewriter-left-to-right.",
          "Spacing remains stable while characters settle."
        ],
        "fallback": {
          "if_motion_feels_too_tall": "Reduce enter from.y_px from 46 to 36.",
          "if_readability_drops": "Increase stagger_ms from 88 to 100 for even more separation."
        }
      }
    },
    "usage_notes": "Best for short single words, labels, or compact headline swaps at 40px+. This version is intentionally more staged than per-character-rise: very large per-symbol delay, fewer simultaneous letters on screen, and a taller lift from below."
  },
  "depth-parallax-words": {
    "id": "depth-parallax-words",
    "display_name": "Depth Parallax Words",
    "description": "Per-word depth motion with scale and vertical drift for layered readability.",
    "inspiration": "Product landing pages combining depth cues with clean typography.",
    "target": "per-word",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "enter": {
      "duration_ms": 700,
      "stagger_ms": 70,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "y_px": 18,
        "scale": 0.92,
        "blur_px": 3
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "scale": 1,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 500,
      "stagger_ms": 45,
      "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "scale": 1,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -10,
        "scale": 1.05,
        "blur_px": 2
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 180,
      "micro_delay_ms": 30
    },
    "usage_notes": "Use short copy blocks and moderate stagger to avoid visual overload."
  },
  "fade-through": {
    "id": "fade-through",
    "display_name": "Fade Through",
    "description": "A Material-style content transition: old fades out, new fades in with a soft delay.",
    "inspiration": "Google Material fade through transitions for same-level UI changes.",
    "target": "whole",
    "signature_easing": "cubic-bezier(0.2, 0, 0, 1)",
    "enter": {
      "duration_ms": 420,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.2, 0, 0, 1)",
      "from": {
        "opacity": 0,
        "y_px": 6,
        "scale": 0.99,
        "blur_px": 2
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "scale": 1,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 260,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.4, 0, 1, 1)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "scale": 1,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -4,
        "scale": 1,
        "blur_px": 0
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 20,
      "micro_delay_ms": 60
    },
    "usage_notes": "Best for replacing content in the same layout slot without directional meaning."
  },
  "focus-blur-resolve": {
    "id": "focus-blur-resolve",
    "display_name": "Focus Blur Resolve",
    "description": "A premium focus pull from heavy blur to crisp text, then a soft blur-out exit.",
    "inspiration": "Apple-style hero transitions that resolve detail with cinematic restraint.",
    "target": "whole",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "enter": {
      "duration_ms": 760,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "y_px": 14,
        "blur_px": 14,
        "scale": 1.01
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0,
        "scale": 1
      }
    },
    "exit": {
      "duration_ms": 520,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0,
        "scale": 1
      },
      "to": {
        "opacity": 0,
        "y_px": -10,
        "blur_px": 10,
        "scale": 1
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 160,
      "micro_delay_ms": 35
    },
    "usage_notes": "Best on large headlines where blur distance reads as intentional and premium."
  },
  "kinetic-center-build": {
    "id": "kinetic-center-build",
    "display_name": "Kinetic Center Build",
    "description": "A word appears in the center; each new word enters from right to left with a soft blur and pushes the existing line until the full phrase locks centered.",
    "inspiration": "Apple keynote kinetic editorial typography and sequential phrase builds.",
    "target": "per-word",
    "signature_easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
    "enter": {
      "duration_ms": 360,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "from": {
        "opacity": 0,
        "y_px": 6,
        "scale": 0.992,
        "blur_px": 3.5
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "scale": 1,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 260,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.4, 0, 0.2, 1)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -6,
        "blur_px": 2.5
      }
    },
    "swap": {
      "mode": "sequential",
      "overlap_ms": 0,
      "micro_delay_ms": 220,
      "scenario_spec": {
        "entry_condition": "Use when a short phrase should be built word-by-word, with each new word entering from the right and physically re-centering the existing line.",
        "switch_order": [
          "Show the first word in the center.",
          "Bring the second word in from right to left while shifting the first word left.",
          "Bring the third word in from right to left while shifting the first two words so the final phrase stays centered."
        ],
        "verification": [
          "Each new word visibly pushes the existing words rather than simply fading in.",
          "The completed phrase ends centered and evenly spaced.",
          "The motion reads as one kinetic line build, not as three isolated reveals."
        ],
        "fallback": {
          "if_push_is_too_subtle": "Increase build.entry_offset_px from 96 to 120.",
          "if_phrase_feels_too_slow": "Reduce build.push_duration_ms from 480 to 420."
        }
      }
    },
    "build": {
      "entry_direction": "from-right",
      "line_alignment": "center",
      "first_word_duration_ms": 340,
      "push_duration_ms": 430,
      "entry_offset_px": 88,
      "word_gap_px": 10,
      "first_word_y_px": 6,
      "entry_scale": 0.992,
      "entry_blur_px": 3.5,
      "reflow_blur_px": 0.8,
      "exit_y_px": -6,
      "exit_blur_px": 2.5,
      "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "exit_easing": "cubic-bezier(0.4, 0, 0.2, 1)",
      "phrase_samples": [
        [
          "Words",
          "push",
          "left"
        ],
        [
          "Type",
          "locks",
          "center"
        ],
        [
          "Build",
          "the",
          "line"
        ]
      ]
    },
    "usage_notes": "Layout-aware effect: each incoming word changes the target x-position of the whole line. Best for short three-word phrases; implementation requires measuring word widths and animating existing words to new positions. A small entry and reflow blur helps the push feel smoother without extending the timing."
  },
  "line-by-line-slide": {
    "id": "line-by-line-slide",
    "display_name": "Line-by-Line Slide",
    "description": "Each line enters from the left with a staggered slide and exits to the right for a flowing paragraph reveal.",
    "inspiration": "Apple landing page subheads and section headers that breathe line by line.",
    "target": "per-line",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "enter": {
      "duration_ms": 900,
      "stagger_ms": 120,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "x_px": -48
      },
      "to": {
        "opacity": 1,
        "x_px": 0
      }
    },
    "exit": {
      "duration_ms": 600,
      "stagger_ms": 80,
      "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
      "from": {
        "opacity": 1,
        "x_px": 0
      },
      "to": {
        "opacity": 0,
        "x_px": 48
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 0,
      "micro_delay_ms": 20
    },
    "usage_notes": "Great for 2-line or 3-line headings. This variant keeps swap non-overlapping to avoid content intersections. Reduce x-distance for narrow layouts to keep motion tight on mobile."
  },
  "mask-reveal-up": {
    "id": "mask-reveal-up",
    "display_name": "Mask Reveal Up",
    "description": "Lines reveal upward with a soft masked feel and compact stagger.",
    "inspiration": "Apple section transitions where multiline copy rises in with control.",
    "target": "per-line",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "enter": {
      "duration_ms": 760,
      "stagger_ms": 90,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "y_px": 30,
        "blur_px": 6
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 520,
      "stagger_ms": 70,
      "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -22,
        "blur_px": 6
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 210,
      "micro_delay_ms": 35
    },
    "usage_notes": "Best for two-line and three-line headings where line order should stay readable."
  },
  "micro-scale-fade": {
    "id": "micro-scale-fade",
    "display_name": "Micro Scale Fade",
    "description": "A calm, tiny scale pop used as subtle premium polish for labels and headings.",
    "inspiration": "Apple system status copy, secondary UI labels, and lightweight onboarding micro-animations.",
    "target": "whole",
    "signature_easing": "cubic-bezier(0.32, 0.72, 0, 1)",
    "enter": {
      "duration_ms": 600,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.32, 0.72, 0, 1)",
      "from": {
        "opacity": 0,
        "scale": 0.96
      },
      "to": {
        "opacity": 1,
        "scale": 1
      }
    },
    "exit": {
      "duration_ms": 400,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
      "from": {
        "opacity": 1,
        "scale": 1
      },
      "to": {
        "opacity": 0,
        "scale": 0.96
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 0,
      "micro_delay_ms": 20
    },
    "usage_notes": "Use this for single words or short titles. This variant keeps swap non-overlapping to avoid content intersections. For paragraphs, switch target to per-word to avoid perceivable lag."
  },
  "per-character-rise": {
    "id": "per-character-rise",
    "display_name": "Per-Character Rise",
    "description": "Letters slide up from below with no blur — crisp, deliberate, kinetic. Apple's clean tvOS-style reveal.",
    "inspiration": "Apple tvOS, Fitness+ intros, iPadOS home screen title appearances.",
    "target": "per-character",
    "signature_easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
    "enter": {
      "duration_ms": 700,
      "stagger_ms": 24,
      "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "from": {
        "opacity": 0,
        "y_px": 32
      },
      "to": {
        "opacity": 1,
        "y_px": 0
      }
    },
    "exit": {
      "duration_ms": 420,
      "stagger_ms": 14,
      "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -24
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 210,
      "scenario_spec": {
        "entry_condition": "Use for headline replacement where each character must remain crisp and readable throughout the switch.",
        "switch_order": [
          "Start old text exit at t=0ms.",
          "Start new text enter at t=exit_total_ms-overlap_ms.",
          "Use a single active headline layer after enter starts to avoid stacked glyph artifacts."
        ],
        "verification": [
          "Characters never blur during swap.",
          "No visible pause appears between exit and enter phases.",
          "Swap keeps staircase rhythm from stagger settings."
        ],
        "fallback": {
          "if_glyphs_collide": "Lower overlap_ms to 140.",
          "if_motion_feels_slow": "Reduce enter stagger_ms from 24 to 18."
        }
      }
    },
    "usage_notes": "Works on 40px+ headlines. Zero blur keeps it sharp — that's the key distinction from soft-blur-in. Stagger 24ms gives it quicker momentum; don't go below 16ms or it flattens."
  },
  "per-word-crossfade": {
    "id": "per-word-crossfade",
    "display_name": "Per-Word Crossfade",
    "description": "Words gently fade into place one after another, with a short vertical drift for a calm keynote rhythm.",
    "inspiration": "Apple product announcements and section title transitions where words are readable but still alive.",
    "target": "per-word",
    "signature_easing": "cubic-bezier(0.16, 1, 0.3, 1)",
    "enter": {
      "duration_ms": 700,
      "stagger_ms": 70,
      "easing": "cubic-bezier(0.16, 1, 0.3, 1)",
      "from": {
        "opacity": 0,
        "y_px": 8
      },
      "to": {
        "opacity": 1,
        "y_px": 0
      }
    },
    "exit": {
      "duration_ms": 500,
      "stagger_ms": 40,
      "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -6
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 170,
      "micro_delay_ms": 70,
      "scenario_spec": {
        "entry_condition": "Use when phrase-level content changes and word readability is more important than per-character flair.",
        "switch_order": [
          "Start old text exit at t=0ms.",
          "Start new text enter at t=exit_total_ms-overlap_ms+micro_delay_ms.",
          "Advance word groups in the same stagger direction for old and new text."
        ],
        "verification": [
          "Word boundaries stay readable during overlap.",
          "No two identical word positions stay stacked for more than one stagger step.",
          "Swap cadence stays calm and editorial, without abrupt jumps."
        ],
        "fallback": {
          "if_words_stack_visibly": "Increase micro_delay_ms to 90.",
          "if_total_swap_is_too_long": "Reduce enter stagger_ms to 55 and overlap_ms to 120."
        }
      }
    },
    "usage_notes": "Best for medium phrases and headings; for long copy prefer per-word only up to 16–18 words to keep total stagger time readable. micro_delay_ms helps prevent old/new words from visibly stacking during swaps."
  },
  "scale-down-fade": {
    "id": "scale-down-fade",
    "display_name": "Scale Down Fade",
    "description": "Subtle premium settle-in with a restrained scale-down fade on exit.",
    "inspiration": "Apple product copy transitions where motion remains quiet and precise.",
    "target": "whole",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "enter": {
      "duration_ms": 520,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "y_px": 8,
        "scale": 1.04
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "scale": 1
      }
    },
    "exit": {
      "duration_ms": 380,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "scale": 1
      },
      "to": {
        "opacity": 0,
        "y_px": -8,
        "scale": 0.94
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 130,
      "micro_delay_ms": 20
    },
    "usage_notes": "Safe default for product UIs where copy should feel polished but not animated."
  },
  "shared-axis-x": {
    "id": "shared-axis-x",
    "display_name": "Shared Axis X",
    "description": "Horizontal shared-axis transition for sibling destinations with continuity.",
    "inspiration": "Google Material shared axis (X) transitions.",
    "target": "whole",
    "signature_easing": "cubic-bezier(0.2, 0, 0, 1)",
    "enter": {
      "duration_ms": 500,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.2, 0, 0, 1)",
      "from": {
        "opacity": 0,
        "x_px": 24,
        "scale": 0.98
      },
      "to": {
        "opacity": 1,
        "x_px": 0,
        "scale": 1
      }
    },
    "exit": {
      "duration_ms": 360,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.4, 0, 1, 1)",
      "from": {
        "opacity": 1,
        "x_px": 0,
        "scale": 1
      },
      "to": {
        "opacity": 0,
        "x_px": -20,
        "scale": 0.98
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 120,
      "micro_delay_ms": 20
    },
    "usage_notes": "Use when moving between same-level views where horizontal direction conveys progress."
  },
  "shared-axis-y": {
    "id": "shared-axis-y",
    "display_name": "Word Cut Staircase",
    "description": "Per-word hard-cut transition with staircase timing for sharp editorial swaps.",
    "inspiration": "Hard-cut typography timing with stepped word sequencing.",
    "target": "per-word",
    "signature_easing": "steps(1, end)",
    "enter": {
      "duration_ms": 180,
      "stagger_ms": 78,
      "easing": "steps(1, end)",
      "from": {
        "opacity": 0,
        "y_px": 0,
        "scale": 1
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "scale": 1
      }
    },
    "exit": {
      "duration_ms": 140,
      "stagger_ms": 78,
      "easing": "steps(1, end)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "scale": 1
      },
      "to": {
        "opacity": 0,
        "y_px": 0,
        "scale": 1
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 0,
      "micro_delay_ms": 28
    },
    "usage_notes": "Use for bold word-by-word hard cuts. No overlap keeps phrase swaps visually clean."
  },
  "shared-axis-z": {
    "id": "shared-axis-z",
    "display_name": "Shared Axis Z",
    "description": "Scale-based shared-axis transition for focus shifts and context depth.",
    "inspiration": "Google Material shared axis (Z), adapted for typography swaps.",
    "target": "whole",
    "signature_easing": "cubic-bezier(0.2, 0, 0, 1)",
    "enter": {
      "duration_ms": 520,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.2, 0, 0, 1)",
      "from": {
        "opacity": 0,
        "scale": 0.9,
        "blur_px": 2
      },
      "to": {
        "opacity": 1,
        "scale": 1,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 360,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.4, 0, 1, 1)",
      "from": {
        "opacity": 1,
        "scale": 1,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "scale": 1.06,
        "blur_px": 1
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 100,
      "micro_delay_ms": 20
    },
    "usage_notes": "Use for emphasizing focus transitions where scale communicates depth."
  },
  "shimmer-sweep": {
    "id": "shimmer-sweep",
    "display_name": "Shimmer Sweep",
    "description": "A subtle sweep across a clean headline, blending in while gliding from left to center.",
    "inspiration": "Premium hero copy transitions where a short soft push is used before settle.",
    "target": "whole",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "enter": {
      "duration_ms": 850,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "x_px": -22,
        "blur_px": 8
      },
      "to": {
        "opacity": 1,
        "x_px": 0,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 650,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
      "from": {
        "opacity": 1,
        "x_px": 0,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "x_px": 22,
        "blur_px": 8
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 0,
      "micro_delay_ms": 36
    },
    "usage_notes": "Use as a premium micro-transition for title swaps and copy refreshes. This variant avoids overlap between outgoing and incoming text."
  },
  "short-slide-down": {
    "id": "short-slide-down",
    "display_name": "Short Slide Down",
    "description": "Each new word drops in from above into its own line and pushes the existing stack downward until a centered three-line composition locks in place.",
    "inspiration": "Keynote-style editorial headings where motion is present but tightly restrained.",
    "target": "per-word",
    "custom_renderer": "kinetic-top-build",
    "signature_easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
    "enter": {
      "duration_ms": 520,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "from": {
        "opacity": 0,
        "y_px": -24,
        "blur_px": 2.4,
        "scale": 0.992
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0,
        "scale": 1
      }
    },
    "exit": {
      "duration_ms": 320,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.4, 0, 0.2, 1)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0,
        "scale": 1
      },
      "to": {
        "opacity": 0,
        "y_px": 10,
        "blur_px": 1.2,
        "scale": 1
      }
    },
    "build": {
      "first_word_duration_ms": 360,
      "push_duration_ms": 500,
      "exit_duration_ms": 320,
      "hold_ms": 1100,
      "between_phrases_ms": 180,
      "entry_offset_y_px": -28,
      "line_gap_px": 12,
      "first_word_y_px": -14,
      "entry_scale": 0.992,
      "entry_blur_px": 2.4,
      "reflow_blur_px": 0.7,
      "exit_y_px": 10,
      "exit_blur_px": 1.2,
      "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "exit_easing": "cubic-bezier(0.4, 0, 0.2, 1)"
    },
    "swap": {
      "mode": "sequential",
      "overlap_ms": 0,
      "micro_delay_ms": 70,
      "scenario_spec": {
        "entry_condition": "Use when three short words should build into a vertical stack, with each new word dropping from above and physically re-centering the composition.",
        "switch_order": [
          "Show the first word in the center with a short top-down drop.",
          "Bring the second word into a lower line while shifting the first word upward into the stack.",
          "Bring the third word into the bottom line while shifting the first two words upward so the final three-line stack stays centered."
        ],
        "verification": [
          "Each new word visibly pushes the existing words rather than simply fading in.",
          "The completed phrase ends as three centered lines with even vertical spacing.",
          "The motion reads as one kinetic stacked build with a top-down entry direction."
        ],
        "fallback": {
          "if_drop_is_too_subtle": "Increase build.entry_offset_y_px from -28 to -36.",
          "if_phrase_feels_too_slow": "Reduce build.push_duration_ms from 500 to 460."
        }
      }
    },
    "usage_notes": "Best on short three-word headings where each word can live on its own line. Keep the vertical drop compact so the motion still feels editorial, and let the stacking displacement carry most of the energy. For longer phrases, reduce entry_offset_y_px or switch to a softer shared-slide pattern."
  },
  "short-slide-right": {
    "id": "short-slide-right",
    "display_name": "Short Slide Right",
    "description": "The whole phrase glides in from the left as one compact move, while the words themselves are revealed in sequence only through opacity.",
    "inspiration": "Keynote-style editorial headings where motion is present but tightly restrained.",
    "target": "per-word",
    "custom_renderer": "shared-slide-opacity-stage",
    "signature_easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
    "enter": {
      "duration_ms": 520,
      "stagger_ms": 92,
      "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "from": {
        "opacity": 1,
        "x_px": -24,
        "blur_px": 1.2
      },
      "to": {
        "opacity": 1,
        "x_px": 0,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 320,
      "stagger_ms": 0,
      "easing": "cubic-bezier(0.4, 0, 0.2, 1)",
      "from": {
        "opacity": 1,
        "x_px": 0,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "x_px": 12,
        "blur_px": 1
      }
    },
    "build": {
      "word_opacity_duration_ms": 210,
      "word_opacity_from": 0,
      "word_opacity_to": 1
    },
    "swap": {
      "mode": "sequential",
      "overlap_ms": 0,
      "micro_delay_ms": 70,
      "scenario_spec": {
        "entry_condition": "Use when the heading should feel like one shared horizontal motion, but the words should reveal progressively.",
        "switch_order": [
          "Start the whole phrase from one shared left offset.",
          "Animate the phrase transform once, with no per-word positional delay.",
          "Reveal each word with only opacity stagger so the ordering reads clearly."
        ],
        "verification": [
          "The phrase position starts and ends in sync for all words.",
          "Only opacity is staggered across the words.",
          "The amplitude stays compact enough to feel controlled, not swishy."
        ],
        "fallback": {
          "if_motion_feels_too_wide": "Reduce enter.from.x_px from -24 to -18.",
          "if_reveal_reads_too_fast": "Increase enter.stagger_ms from 92 to 108.",
          "if_words_feel_too_ghosted": "Increase build.word_opacity_duration_ms from 210 to 240."
        }
      }
    },
    "usage_notes": "Best on three-word headings where word order matters. Keep the horizontal travel compact and shared; the phrase should read as one move, with staging communicated only by opacity. For longer phrases, reduce stagger_ms or shorten the opacity duration so the cascade does not drag."
  },
  "soft-blur-in": {
    "id": "soft-blur-in",
    "display_name": "Soft Blur",
    "description": "Per-character fade-in with a gentle blur and upward motion. Apple's signature hero-title reveal.",
    "inspiration": "Apple keynote intros; iPhone, Mac, and Vision Pro product page headlines; macOS system UI reveals.",
    "target": "per-character",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "enter": {
      "duration_ms": 900,
      "stagger_ms": 25,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "y_px": 16,
        "blur_px": 12
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 600,
      "stagger_ms": 15,
      "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -16,
        "blur_px": 12
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 300,
      "scenario_spec": {
        "entry_condition": "Use when text is replaced in the same layout slot and both strings remain visually stable in one block.",
        "switch_order": [
          "Start old text exit at t=0ms.",
          "Start new text enter at t=exit_total_ms-overlap_ms.",
          "Keep both text layers mounted only during the overlap window."
        ],
        "verification": [
          "No hard-cut frame appears between old and new text.",
          "Blur stays readable during overlap on desktop and mobile.",
          "Total swap duration remains below 1300ms for default sample length."
        ],
        "fallback": {
          "if_overlap_looks_heavy": "Reduce overlap_ms to 180 and exit blur_px to 8.",
          "if_copy_is_long": "Switch target to per-word and reduce enter stagger_ms to 15."
        }
      }
    },
    "usage_notes": "Works best on hero titles 48px+ against solid backgrounds. On body text (<24px), reduce blur_px to 6 and stagger_ms to 15. Avoid on very long strings (>40 chars) — total stagger becomes too long; in that case switch target to 'per-word'."
  },
  "spring-scale-in": {
    "id": "spring-scale-in",
    "display_name": "Spring Scale In",
    "description": "Words pop in with a soft overshoot scale, like a physical spring settling into place.",
    "inspiration": "iOS app icons bouncing into the home screen, macOS Dock, widget appearances, Vision Pro floating UI pops.",
    "target": "per-word",
    "signature_easing": "cubic-bezier(0.34, 1.56, 0.64, 1)",
    "enter": {
      "duration_ms": 360,
      "stagger_ms": 95,
      "easing": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      "from": {
        "opacity": 0,
        "scale": 0.7
      },
      "to": {
        "opacity": 1,
        "scale": 1
      }
    },
    "exit": {
      "duration_ms": 200,
      "stagger_ms": 80,
      "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
      "from": {
        "opacity": 1,
        "scale": 1
      },
      "to": {
        "opacity": 0,
        "scale": 0.8
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 0,
      "micro_delay_ms": 35
    },
    "usage_notes": "The overshoot comes from cubic-bezier y2 > 1 (1.56). Per-word is the sweet spot - per-character at this easing feels too bouncy. Stagger is intentionally high here to create a visible staircase effect. This variant uses no overlap on swap to avoid content crossing during transitions."
  },
  "stagger-from-center": {
    "id": "stagger-from-center",
    "display_name": "Stagger from Center",
    "description": "Characters reveal from the center outward to emphasize the keyword core.",
    "inspiration": "Product hero typography where center-weighted emphasis drives attention.",
    "target": "per-character",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "stagger_mode": "center-out",
    "enter": {
      "duration_ms": 620,
      "stagger_ms": 22,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "y_px": 12,
        "blur_px": 3
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 420,
      "stagger_ms": 16,
      "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -8,
        "blur_px": 3
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 150,
      "micro_delay_ms": 20
    },
    "usage_notes": "Use on short words or compact titles; long text reduces the center-emphasis effect."
  },
  "stagger-from-edges": {
    "id": "stagger-from-edges",
    "display_name": "Stagger from Edges",
    "description": "Characters start from both edges and converge toward the center.",
    "inspiration": "Directional typography reveals used in modern product hero systems.",
    "target": "per-character",
    "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
    "stagger_mode": "edges-in",
    "enter": {
      "duration_ms": 620,
      "stagger_ms": 22,
      "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "from": {
        "opacity": 0,
        "y_px": 12,
        "blur_px": 3
      },
      "to": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      }
    },
    "exit": {
      "duration_ms": 420,
      "stagger_ms": 16,
      "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0,
        "blur_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -8,
        "blur_px": 3
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 150,
      "micro_delay_ms": 20
    },
    "usage_notes": "Effective for medium word lengths where edge-to-center motion remains readable."
  },
  "top-down-letters": {
    "id": "top-down-letters",
    "display_name": "Top-Down Letters",
    "description": "Letters descend from above in a pronounced staircase, one symbol at a time, with zero blur.",
    "inspiration": "Apple-style keynote typography, crisp editorial headers, and controlled top-down word reveals.",
    "target": "per-character",
    "signature_easing": "cubic-bezier(0.18, 1, 0.32, 1)",
    "enter": {
      "duration_ms": 400,
      "stagger_ms": 88,
      "easing": "cubic-bezier(0.18, 1, 0.32, 1)",
      "from": {
        "opacity": 0,
        "y_px": -46
      },
      "to": {
        "opacity": 1,
        "y_px": 0
      }
    },
    "exit": {
      "duration_ms": 280,
      "stagger_ms": 28,
      "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": 14
      }
    },
    "swap": {
      "mode": "sequential",
      "overlap_ms": 0,
      "micro_delay_ms": 35,
      "scenario_spec": {
        "entry_condition": "Use when short words or compact headlines should build downward letter by letter with completely crisp glyph edges.",
        "switch_order": [
          "Run old text exit first so the slot clears cleanly.",
          "Wait micro_delay_ms after exit.",
          "Start new text enter from above with per-character stagger."
        ],
        "verification": [
          "Letters never blur during enter or exit.",
          "The reveal clearly reads top-down rather than typewriter-left-to-right.",
          "Spacing remains stable while characters settle."
        ],
        "fallback": {
          "if_motion_feels_too_tall": "Reduce enter from.y_px from -46 to -36.",
          "if_readability_drops": "Increase stagger_ms from 88 to 100 for even more separation."
        }
      }
    },
    "usage_notes": "Best for short single words, labels, or compact headline swaps at 40px+. This is the top-down counterpart to bottom-up-letters: very large per-symbol delay, fewer simultaneous letters on screen, and a tall drop from above."
  },
  "typewriter": {
    "id": "typewriter",
    "display_name": "Typewriter",
    "description": "Per-character stepped reveal with a minimal editorial typing rhythm.",
    "inspiration": "System-like text build patterns in Apple presentation and utility UI.",
    "target": "per-character",
    "signature_easing": "steps(1, end)",
    "enter": {
      "duration_ms": 240,
      "stagger_ms": 46,
      "easing": "steps(1, end)",
      "from": {
        "opacity": 0,
        "y_px": 0
      },
      "to": {
        "opacity": 1,
        "y_px": 0
      }
    },
    "exit": {
      "duration_ms": 260,
      "stagger_ms": 10,
      "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
      "from": {
        "opacity": 1,
        "y_px": 0
      },
      "to": {
        "opacity": 0,
        "y_px": -4
      }
    },
    "swap": {
      "mode": "crossfade",
      "overlap_ms": 0,
      "micro_delay_ms": 85
    },
    "usage_notes": "Good for short copy. Keep line length moderate so stepping stays intentional."
  }
},
	effectModules: {
  "blur-out-up": {
    "id": "blur-out-up",
    "visibility": "visible",
    "portable_spec": {
      "id": "blur-out-up",
      "display_name": "Blur Out Up",
      "description": "Words arrive clean and depart upward with increasing blur for airy exits.",
      "inspiration": "Apple-style light typography where exit has more character than entry.",
      "target": "per-word",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "enter": {
        "duration_ms": 560,
        "stagger_ms": 28,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "y_px": 10,
          "blur_px": 6
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 480,
        "stagger_ms": 24,
        "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -14,
          "blur_px": 8
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 170,
        "micro_delay_ms": 35
      },
      "usage_notes": "Works best on short phrases; avoid very long lines to keep swap time tight."
    },
    "showcase": {
      "content": {
        "sample": "Clear in, airy out.",
        "samples": [
          "Clear in, airy out.",
          "Lightweight typography.",
          "Exit with grace."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "blur-out-up"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 35,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 560,
          "source_stagger_ms": 28,
          "scaled_duration_ms": 403,
          "scaled_stagger_ms": 20,
          "easing": "cubic-bezier(0.22, 1, 0.36, 1)"
        },
        "exit": {
          "source_duration_ms": 480,
          "source_stagger_ms": 24,
          "scaled_duration_ms": 346,
          "scaled_stagger_ms": 17,
          "easing": "cubic-bezier(0.64, 0, 0.78, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-word",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "bottom-up-letters": {
    "id": "bottom-up-letters",
    "visibility": "visible",
    "portable_spec": {
      "id": "bottom-up-letters",
      "display_name": "Bottom-Up Letters",
      "description": "Letters rise from below in a pronounced staircase, one symbol at a time, with zero blur.",
      "inspiration": "Apple-style keynote typography, sharp lower-thirds, and clean editorial word swaps.",
      "target": "per-character",
      "signature_easing": "cubic-bezier(0.18, 1, 0.32, 1)",
      "enter": {
        "duration_ms": 400,
        "stagger_ms": 88,
        "easing": "cubic-bezier(0.18, 1, 0.32, 1)",
        "from": {
          "opacity": 0,
          "y_px": 46
        },
        "to": {
          "opacity": 1,
          "y_px": 0
        }
      },
      "exit": {
        "duration_ms": 280,
        "stagger_ms": 28,
        "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -14
        }
      },
      "swap": {
        "mode": "sequential",
        "overlap_ms": 0,
        "micro_delay_ms": 35,
        "scenario_spec": {
          "entry_condition": "Use when short words or compact headlines should build upward letter by letter with completely crisp glyph edges.",
          "switch_order": [
            "Run old text exit first so the slot clears cleanly.",
            "Wait micro_delay_ms after exit.",
            "Start new text enter from below with per-character stagger."
          ],
          "verification": [
            "Letters never blur during enter or exit.",
            "The reveal clearly reads bottom-up rather than typewriter-left-to-right.",
            "Spacing remains stable while characters settle."
          ],
          "fallback": {
            "if_motion_feels_too_tall": "Reduce enter from.y_px from 46 to 36.",
            "if_readability_drops": "Increase stagger_ms from 88 to 100 for even more separation."
          }
        }
      },
      "usage_notes": "Best for short single words, labels, or compact headline swaps at 40px+. This version is intentionally more staged than per-character-rise: very large per-symbol delay, fewer simultaneous letters on screen, and a taller lift from below."
    },
    "showcase": {
      "content": {
        "sample": "Shift",
        "samples": [
          "Shift",
          "Stage",
          "Letter"
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "bottom-up-letters"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 35,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 400,
          "source_stagger_ms": 88,
          "scaled_duration_ms": 288,
          "scaled_stagger_ms": 63,
          "easing": "cubic-bezier(0.18, 1, 0.32, 1)"
        },
        "exit": {
          "source_duration_ms": 280,
          "source_stagger_ms": 28,
          "scaled_duration_ms": 202,
          "scaled_stagger_ms": 20,
          "easing": "cubic-bezier(0.7, 0, 0.84, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-character",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "depth-parallax-words": {
    "id": "depth-parallax-words",
    "visibility": "hidden",
    "portable_spec": {
      "id": "depth-parallax-words",
      "display_name": "Depth Parallax Words",
      "description": "Per-word depth motion with scale and vertical drift for layered readability.",
      "inspiration": "Product landing pages combining depth cues with clean typography.",
      "target": "per-word",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "enter": {
        "duration_ms": 700,
        "stagger_ms": 70,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "y_px": 18,
          "scale": 0.92,
          "blur_px": 3
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "scale": 1,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 500,
        "stagger_ms": 45,
        "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "scale": 1,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -10,
          "scale": 1.05,
          "blur_px": 2
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 180,
        "micro_delay_ms": 30
      },
      "usage_notes": "Use short copy blocks and moderate stagger to avoid visual overload."
    },
    "showcase": null
  },
  "fade-through": {
    "id": "fade-through",
    "visibility": "visible",
    "portable_spec": {
      "id": "fade-through",
      "display_name": "Fade Through",
      "description": "A Material-style content transition: old fades out, new fades in with a soft delay.",
      "inspiration": "Google Material fade through transitions for same-level UI changes.",
      "target": "whole",
      "signature_easing": "cubic-bezier(0.2, 0, 0, 1)",
      "enter": {
        "duration_ms": 420,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.2, 0, 0, 1)",
        "from": {
          "opacity": 0,
          "y_px": 6,
          "scale": 0.99,
          "blur_px": 2
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "scale": 1,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 260,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.4, 0, 1, 1)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "scale": 1,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -4,
          "scale": 1,
          "blur_px": 0
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 20,
        "micro_delay_ms": 60
      },
      "usage_notes": "Best for replacing content in the same layout slot without directional meaning."
    },
    "showcase": {
      "content": {
        "sample": "Calm transitions.",
        "samples": [
          "Calm transitions.",
          "Fade through content.",
          "Focus shifts smoothly."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "fade-through"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 60,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 420,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 302,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.2, 0, 0, 1)"
        },
        "exit": {
          "source_duration_ms": 260,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 187,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.4, 0, 1, 1)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "whole",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "focus-blur-resolve": {
    "id": "focus-blur-resolve",
    "visibility": "visible",
    "portable_spec": {
      "id": "focus-blur-resolve",
      "display_name": "Focus Blur Resolve",
      "description": "A premium focus pull from heavy blur to crisp text, then a soft blur-out exit.",
      "inspiration": "Apple-style hero transitions that resolve detail with cinematic restraint.",
      "target": "whole",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "enter": {
        "duration_ms": 760,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "y_px": 14,
          "blur_px": 14,
          "scale": 1.01
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0,
          "scale": 1
        }
      },
      "exit": {
        "duration_ms": 520,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0,
          "scale": 1
        },
        "to": {
          "opacity": 0,
          "y_px": -10,
          "blur_px": 10,
          "scale": 1
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 160,
        "micro_delay_ms": 35
      },
      "usage_notes": "Best on large headlines where blur distance reads as intentional and premium."
    },
    "showcase": {
      "content": {
        "sample": "Focus resolves clearly.",
        "samples": [
          "Focus resolves clearly.",
          "Detail emerges.",
          "Then softly recedes."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "focus-blur-resolve"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 35,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 760,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 547,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.22, 1, 0.36, 1)"
        },
        "exit": {
          "source_duration_ms": 520,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 374,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.64, 0, 0.78, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "whole",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "kinetic-center-build": {
    "id": "kinetic-center-build",
    "visibility": "visible",
    "portable_spec": {
      "id": "kinetic-center-build",
      "display_name": "Kinetic Center Build",
      "description": "A word appears in the center; each new word enters from right to left with a soft blur and pushes the existing line until the full phrase locks centered.",
      "inspiration": "Apple keynote kinetic editorial typography and sequential phrase builds.",
      "target": "per-word",
      "signature_easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "enter": {
        "duration_ms": 360,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "from": {
          "opacity": 0,
          "y_px": 6,
          "scale": 0.992,
          "blur_px": 3.5
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "scale": 1,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 260,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.4, 0, 0.2, 1)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -6,
          "blur_px": 2.5
        }
      },
      "swap": {
        "mode": "sequential",
        "overlap_ms": 0,
        "micro_delay_ms": 220,
        "scenario_spec": {
          "entry_condition": "Use when a short phrase should be built word-by-word, with each new word entering from the right and physically re-centering the existing line.",
          "switch_order": [
            "Show the first word in the center.",
            "Bring the second word in from right to left while shifting the first word left.",
            "Bring the third word in from right to left while shifting the first two words so the final phrase stays centered."
          ],
          "verification": [
            "Each new word visibly pushes the existing words rather than simply fading in.",
            "The completed phrase ends centered and evenly spaced.",
            "The motion reads as one kinetic line build, not as three isolated reveals."
          ],
          "fallback": {
            "if_push_is_too_subtle": "Increase build.entry_offset_px from 96 to 120.",
            "if_phrase_feels_too_slow": "Reduce build.push_duration_ms from 480 to 420."
          }
        }
      },
      "build": {
        "entry_direction": "from-right",
        "line_alignment": "center",
        "first_word_duration_ms": 340,
        "push_duration_ms": 430,
        "entry_offset_px": 88,
        "word_gap_px": 10,
        "first_word_y_px": 6,
        "entry_scale": 0.992,
        "entry_blur_px": 3.5,
        "reflow_blur_px": 0.8,
        "exit_y_px": -6,
        "exit_blur_px": 2.5,
        "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "exit_easing": "cubic-bezier(0.4, 0, 0.2, 1)",
        "phrase_samples": [
          [
            "Words",
            "push",
            "left"
          ],
          [
            "Type",
            "locks",
            "center"
          ],
          [
            "Build",
            "the",
            "line"
          ]
        ]
      },
      "usage_notes": "Layout-aware effect: each incoming word changes the target x-position of the whole line. Best for short three-word phrases; implementation requires measuring word widths and animating existing words to new positions. A small entry and reflow blur helps the push feel smoother without extending the timing."
    },
    "showcase": {
      "content": {
        "sample": "Words push left.",
        "phrases": [
          [
            "Words",
            "push",
            "left"
          ],
          [
            "Type",
            "locks",
            "center"
          ],
          [
            "Build",
            "the",
            "line"
          ]
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "kinetic-center-build"
      },
      "renderer": {
        "id": "kinetic-center-build",
        "source": "catalog-override",
        "params": {
          "entry_direction": "from-right",
          "line_alignment": "center",
          "first_word_duration_ms": 340,
          "push_duration_ms": 430,
          "entry_offset_px": 88,
          "word_gap_px": 10,
          "first_word_y_px": 6,
          "entry_scale": 0.992,
          "entry_blur_px": 3.5,
          "reflow_blur_px": 0.8,
          "exit_y_px": -6,
          "exit_blur_px": 2.5,
          "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
          "exit_easing": "cubic-bezier(0.4, 0, 0.2, 1)",
          "phrase_samples": [
            [
              "Words",
              "push",
              "left"
            ],
            [
              "Type",
              "locks",
              "center"
            ],
            [
              "Build",
              "the",
              "line"
            ]
          ]
        },
        "recipe": {
          "id": "kinetic-center-build",
          "summary": "Build a centered horizontal phrase word by word; each incoming word enters from the right and pushes existing words into newly centered positions.",
          "required_measurements": [
            "offsetWidth for every word after appending the incoming word"
          ],
          "algorithm": [
            "Create a relative kinetic line container using the kinetic-line-host stage preset.",
            "For each phrase word, append an absolutely centered word span.",
            "Measure all child widths and compute centered x positions: totalWidth = sum(widths) + word_gap_px * (count - 1); cursor starts at -totalWidth / 2; each word position is cursor + width / 2.",
            "First word enters at x=0 with first_word_y_px, entry_scale, entry_blur_px, and opacity 0, then settles to x=0/y=0/scale=1/blur=0/opacity=1.",
            "For later words, animate existing words from previous x positions to next centered x positions while the incoming word starts at targetX + entry_offset_px and lands at targetX.",
            "Use an intermediate keyframe around offset 0.52 for existing-word reflow blur and 0.6 for incoming-word settle blur.",
            "After every push, snap all words to exact final poses to avoid accumulated engine drift.",
            "Exit all words together from current centered x positions with exit_y_px and exit_blur_px, then clear the line."
          ],
          "frame_materialization": {
            "coordinate_space": "x/y values are renderer pixel coordinates and are not multiplied by runtime.y_travel_multiplier.",
            "transform": "translate(-50%, -50%) translate3d(x, y, 0) scale(scale)",
            "filter": "blur(blur)",
            "opacity": "unit opacity"
          },
          "keyframe_recipe": {
            "first_word": [
              {
                "offset": 0,
                "x": 0,
                "y": "build.first_word_y_px",
                "scale": "build.entry_scale",
                "blur": "build.entry_blur_px",
                "opacity": 0
              },
              {
                "offset": 0.58,
                "x": 0,
                "y": "build.first_word_y_px * 0.35",
                "scale": 0.998,
                "blur": "build.entry_blur_px * 0.45",
                "opacity": 0.78
              },
              {
                "offset": 1,
                "x": 0,
                "y": 0,
                "scale": 1,
                "blur": 0,
                "opacity": 1
              }
            ],
            "existing_word_push": [
              {
                "offset": 0,
                "x": "currentX",
                "y": 0,
                "scale": 1,
                "blur": 0,
                "opacity": 1
              },
              {
                "offset": 0.52,
                "x": "mix(currentX, nextX, 0.58)",
                "y": 0,
                "scale": 1,
                "blur": "build.reflow_blur_px",
                "opacity": 1
              },
              {
                "offset": 1,
                "x": "nextX",
                "y": 0,
                "scale": 1,
                "blur": 0,
                "opacity": 1
              }
            ],
            "incoming_word_push": [
              {
                "offset": 0,
                "x": "targetX + build.entry_offset_px",
                "y": 0,
                "scale": "build.entry_scale",
                "blur": "build.entry_blur_px",
                "opacity": 0
              },
              {
                "offset": 0.6,
                "x": "mix(targetX + build.entry_offset_px, targetX, 0.72)",
                "y": 0,
                "scale": 0.998,
                "blur": "build.entry_blur_px * 0.38",
                "opacity": 0.84
              },
              {
                "offset": 1,
                "x": "targetX",
                "y": 0,
                "scale": 1,
                "blur": 0,
                "opacity": 1
              }
            ],
            "exit_word": [
              {
                "offset": 0,
                "x": "position",
                "y": 0,
                "scale": 1,
                "blur": 0,
                "opacity": 1
              },
              {
                "offset": 0.52,
                "x": "position",
                "y": "build.exit_y_px * 0.45",
                "scale": 1,
                "blur": "build.exit_blur_px * 0.55",
                "opacity": 0.62
              },
              {
                "offset": 1,
                "x": "position",
                "y": "build.exit_y_px",
                "scale": 1,
                "blur": "build.exit_blur_px",
                "opacity": 0
              }
            ]
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "build-phrase",
          "hold",
          "exit-phrase",
          "gap"
        ],
        "replacement_behavior": "phrase-loop",
        "hold_ms": 706,
        "micro_delay_ms": 0,
        "gap_ms": 158
      },
      "timing": {
        "first_word": {
          "source_duration_ms": 340,
          "scaled_duration_ms": 245,
          "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
        },
        "push": {
          "source_duration_ms": 430,
          "scaled_duration_ms": 310,
          "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
        },
        "exit": {
          "source_duration_ms": 260,
          "scaled_duration_ms": 187,
          "easing": "cubic-bezier(0.4, 0, 0.2, 1)"
        },
        "hold_ms": 706,
        "gap_ms": 158
      },
      "stage": {
        "preset": "kinetic-line-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        },
        "kinetic_container": {
          "requirement": "Use a relative-positioned inline host large enough for the phrase; exact dimensions belong to the consuming UI.",
          "position": "relative",
          "coordinate_origin": "center"
        },
        "kinetic_word": {
          "backface_visibility": "hidden",
          "left": "50%",
          "position": "absolute",
          "top": "50%",
          "white_space": "nowrap",
          "absolute_centered": true,
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "kinetic-center-build",
        "target": "per-word",
        "stagger_mode": "normal",
        "coordinate_space": "renderer-pixels",
        "y_travel_multiplier": 1,
        "y_travel_multiplier_note": "runtime.y_travel_multiplier is not applied to kinetic build coordinates; x/y values in build params are final transform pixels.",
        "transform_order": "translate(-50%, -50%) translate3d(x_px, y_px, 0) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "follow renderer recipe algorithm"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Measure word widths after appending each incoming word.",
            "Compute centered x positions from measured widths and word_gap_px.",
            "Use raw renderer-pixel build x/y values; do not apply y_travel_multiplier to kinetic coordinates.",
            "Use renderer.recipe.keyframe_recipe exactly: existing-word reflow x is mix(currentX, nextX, 0.58) at offset 0.52; incoming-word settle x is mix(startX, targetX, 0.72) at offset 0.6.",
            "Exit uses a three-keyframe path with offset 0.52 at y = exit_y_px * 0.45 and opacity 0.62, not a two-keyframe fade."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Measure word widths after appending each incoming word.",
            "Compute centered x positions from measured widths and word_gap_px.",
            "Use raw renderer-pixel build x/y values; do not apply y_travel_multiplier to kinetic coordinates.",
            "Use renderer.recipe.keyframe_recipe exactly: existing-word reflow x is mix(currentX, nextX, 0.58) at offset 0.52; incoming-word settle x is mix(startX, targetX, 0.72) at offset 0.6.",
            "Exit uses a three-keyframe path with offset 0.52 at y = exit_y_px * 0.45 and opacity 0.62, not a two-keyframe fade."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Measure word widths after appending each incoming word.",
            "Compute centered x positions from measured widths and word_gap_px.",
            "Use raw renderer-pixel build x/y values; do not apply y_travel_multiplier to kinetic coordinates.",
            "Use renderer.recipe.keyframe_recipe exactly: existing-word reflow x is mix(currentX, nextX, 0.58) at offset 0.52; incoming-word settle x is mix(startX, targetX, 0.72) at offset 0.6.",
            "Exit uses a three-keyframe path with offset 0.52 at y = exit_y_px * 0.45 and opacity 0.62, not a two-keyframe fade."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "All engines",
          "notes": [
            "Do not apply runtime.y_travel_multiplier to kinetic build x/y coordinates; buildKineticFrame uses the build params as final transform pixels.",
            "Use explicit offset keyframes for the intermediate reflow frames, then snap final styles after each push to avoid layout drift."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect is layout-aware. Measure word widths, compute centered x positions for the whole phrase, and animate existing words to their next positions while the incoming word enters from the right.",
        "For site parity, scale duration and stagger timing by 0.72. Keep kinetic build x/y params as raw renderer pixel coordinates; runtime.y_travel_multiplier applies to generic/title frame conversion, not to buildKineticFrame coordinates.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "line-by-line-slide": {
    "id": "line-by-line-slide",
    "visibility": "visible",
    "portable_spec": {
      "id": "line-by-line-slide",
      "display_name": "Line-by-Line Slide",
      "description": "Each line enters from the left with a staggered slide and exits to the right for a flowing paragraph reveal.",
      "inspiration": "Apple landing page subheads and section headers that breathe line by line.",
      "target": "per-line",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "enter": {
        "duration_ms": 900,
        "stagger_ms": 120,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "x_px": -48
        },
        "to": {
          "opacity": 1,
          "x_px": 0
        }
      },
      "exit": {
        "duration_ms": 600,
        "stagger_ms": 80,
        "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
        "from": {
          "opacity": 1,
          "x_px": 0
        },
        "to": {
          "opacity": 0,
          "x_px": 48
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 0,
        "micro_delay_ms": 20
      },
      "usage_notes": "Great for 2-line or 3-line headings. This variant keeps swap non-overlapping to avoid content intersections. Reduce x-distance for narrow layouts to keep motion tight on mobile."
    },
    "showcase": {
      "content": {
        "sample": "Think different.\nDo more.",
        "samples": [
          "Think different.\nDo more.",
          "Built for speed.\nMade to last.",
          "Clear ideas.\nClean motion."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "line-by-line-slide"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 20,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 900,
          "source_stagger_ms": 120,
          "scaled_duration_ms": 648,
          "scaled_stagger_ms": 86,
          "easing": "cubic-bezier(0.22, 1, 0.36, 1)"
        },
        "exit": {
          "source_duration_ms": 600,
          "source_stagger_ms": 80,
          "scaled_duration_ms": 432,
          "scaled_stagger_ms": 58,
          "easing": "cubic-bezier(0.64, 0, 0.78, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-line",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "mask-reveal-up": {
    "id": "mask-reveal-up",
    "visibility": "visible",
    "portable_spec": {
      "id": "mask-reveal-up",
      "display_name": "Mask Reveal Up",
      "description": "Lines reveal upward with a soft masked feel and compact stagger.",
      "inspiration": "Apple section transitions where multiline copy rises in with control.",
      "target": "per-line",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "enter": {
        "duration_ms": 760,
        "stagger_ms": 90,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "y_px": 30,
          "blur_px": 6
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 520,
        "stagger_ms": 70,
        "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -22,
          "blur_px": 6
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 210,
        "micro_delay_ms": 35
      },
      "usage_notes": "Best for two-line and three-line headings where line order should stay readable."
    },
    "showcase": {
      "content": {
        "sample": "Designed to move.\nBuilt to focus.",
        "samples": [
          "Designed to move.\nBuilt to focus.",
          "Quiet motion.\nStrong hierarchy.",
          "Premium feel.\nEvery frame."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "mask-reveal-up"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 35,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 760,
          "source_stagger_ms": 90,
          "scaled_duration_ms": 547,
          "scaled_stagger_ms": 65,
          "easing": "cubic-bezier(0.22, 1, 0.36, 1)"
        },
        "exit": {
          "source_duration_ms": 520,
          "source_stagger_ms": 70,
          "scaled_duration_ms": 374,
          "scaled_stagger_ms": 50,
          "easing": "cubic-bezier(0.64, 0, 0.78, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-line",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "micro-scale-fade": {
    "id": "micro-scale-fade",
    "visibility": "visible",
    "portable_spec": {
      "id": "micro-scale-fade",
      "display_name": "Micro Scale Fade",
      "description": "A calm, tiny scale pop used as subtle premium polish for labels and headings.",
      "inspiration": "Apple system status copy, secondary UI labels, and lightweight onboarding micro-animations.",
      "target": "whole",
      "signature_easing": "cubic-bezier(0.32, 0.72, 0, 1)",
      "enter": {
        "duration_ms": 600,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.32, 0.72, 0, 1)",
        "from": {
          "opacity": 0,
          "scale": 0.96
        },
        "to": {
          "opacity": 1,
          "scale": 1
        }
      },
      "exit": {
        "duration_ms": 400,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
        "from": {
          "opacity": 1,
          "scale": 1
        },
        "to": {
          "opacity": 0,
          "scale": 0.96
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 0,
        "micro_delay_ms": 20
      },
      "usage_notes": "Use this for single words or short titles. This variant keeps swap non-overlapping to avoid content intersections. For paragraphs, switch target to per-word to avoid perceivable lag."
    },
    "showcase": {
      "content": {
        "sample": "Welcome to motion.",
        "samples": [
          "Welcome to motion.",
          "Small details matter.",
          "Quietly premium."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "micro-scale-fade"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 20,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 600,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 432,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.32, 0.72, 0, 1)"
        },
        "exit": {
          "source_duration_ms": 400,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 288,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.7, 0, 0.84, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "whole",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "per-character-rise": {
    "id": "per-character-rise",
    "visibility": "visible",
    "portable_spec": {
      "id": "per-character-rise",
      "display_name": "Per-Character Rise",
      "description": "Letters slide up from below with no blur — crisp, deliberate, kinetic. Apple's clean tvOS-style reveal.",
      "inspiration": "Apple tvOS, Fitness+ intros, iPadOS home screen title appearances.",
      "target": "per-character",
      "signature_easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "enter": {
        "duration_ms": 700,
        "stagger_ms": 24,
        "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "from": {
          "opacity": 0,
          "y_px": 32
        },
        "to": {
          "opacity": 1,
          "y_px": 0
        }
      },
      "exit": {
        "duration_ms": 420,
        "stagger_ms": 14,
        "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -24
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 210,
        "scenario_spec": {
          "entry_condition": "Use for headline replacement where each character must remain crisp and readable throughout the switch.",
          "switch_order": [
            "Start old text exit at t=0ms.",
            "Start new text enter at t=exit_total_ms-overlap_ms.",
            "Use a single active headline layer after enter starts to avoid stacked glyph artifacts."
          ],
          "verification": [
            "Characters never blur during swap.",
            "No visible pause appears between exit and enter phases.",
            "Swap keeps staircase rhythm from stagger settings."
          ],
          "fallback": {
            "if_glyphs_collide": "Lower overlap_ms to 140.",
            "if_motion_feels_slow": "Reduce enter stagger_ms from 24 to 18."
          }
        }
      },
      "usage_notes": "Works on 40px+ headlines. Zero blur keeps it sharp — that's the key distinction from soft-blur-in. Stagger 24ms gives it quicker momentum; don't go below 16ms or it flattens."
    },
    "showcase": {
      "content": {
        "sample": "One more thing.",
        "samples": [
          "One more thing.",
          "Fast and fluid.",
          "Sharp by design."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "per-character-rise"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 0,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 700,
          "source_stagger_ms": 24,
          "scaled_duration_ms": 504,
          "scaled_stagger_ms": 17,
          "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
        },
        "exit": {
          "source_duration_ms": 420,
          "source_stagger_ms": 14,
          "scaled_duration_ms": 302,
          "scaled_stagger_ms": 10,
          "easing": "cubic-bezier(0.7, 0, 0.84, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-character",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "per-word-crossfade": {
    "id": "per-word-crossfade",
    "visibility": "visible",
    "portable_spec": {
      "id": "per-word-crossfade",
      "display_name": "Per-Word Crossfade",
      "description": "Words gently fade into place one after another, with a short vertical drift for a calm keynote rhythm.",
      "inspiration": "Apple product announcements and section title transitions where words are readable but still alive.",
      "target": "per-word",
      "signature_easing": "cubic-bezier(0.16, 1, 0.3, 1)",
      "enter": {
        "duration_ms": 700,
        "stagger_ms": 70,
        "easing": "cubic-bezier(0.16, 1, 0.3, 1)",
        "from": {
          "opacity": 0,
          "y_px": 8
        },
        "to": {
          "opacity": 1,
          "y_px": 0
        }
      },
      "exit": {
        "duration_ms": 500,
        "stagger_ms": 40,
        "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -6
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 170,
        "micro_delay_ms": 70,
        "scenario_spec": {
          "entry_condition": "Use when phrase-level content changes and word readability is more important than per-character flair.",
          "switch_order": [
            "Start old text exit at t=0ms.",
            "Start new text enter at t=exit_total_ms-overlap_ms+micro_delay_ms.",
            "Advance word groups in the same stagger direction for old and new text."
          ],
          "verification": [
            "Word boundaries stay readable during overlap.",
            "No two identical word positions stay stacked for more than one stagger step.",
            "Swap cadence stays calm and editorial, without abrupt jumps."
          ],
          "fallback": {
            "if_words_stack_visibly": "Increase micro_delay_ms to 90.",
            "if_total_swap_is_too_long": "Reduce enter stagger_ms to 55 and overlap_ms to 120."
          }
        }
      },
      "usage_notes": "Best for medium phrases and headings; for long copy prefer per-word only up to 16–18 words to keep total stagger time readable. micro_delay_ms helps prevent old/new words from visibly stacking during swaps."
    },
    "showcase": {
      "content": {
        "sample": "Beautifully, unmistakably simple.",
        "samples": [
          "Beautifully simple.",
          "Designed for focus.",
          "Built for people."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "per-word-crossfade"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 70,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 700,
          "source_stagger_ms": 70,
          "scaled_duration_ms": 504,
          "scaled_stagger_ms": 50,
          "easing": "cubic-bezier(0.16, 1, 0.3, 1)"
        },
        "exit": {
          "source_duration_ms": 500,
          "source_stagger_ms": 40,
          "scaled_duration_ms": 360,
          "scaled_stagger_ms": 29,
          "easing": "cubic-bezier(0.7, 0, 0.84, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-word",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "scale-down-fade": {
    "id": "scale-down-fade",
    "visibility": "visible",
    "portable_spec": {
      "id": "scale-down-fade",
      "display_name": "Scale Down Fade",
      "description": "Subtle premium settle-in with a restrained scale-down fade on exit.",
      "inspiration": "Apple product copy transitions where motion remains quiet and precise.",
      "target": "whole",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "enter": {
        "duration_ms": 520,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "y_px": 8,
          "scale": 1.04
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "scale": 1
        }
      },
      "exit": {
        "duration_ms": 380,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "scale": 1
        },
        "to": {
          "opacity": 0,
          "y_px": -8,
          "scale": 0.94
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 130,
        "micro_delay_ms": 20
      },
      "usage_notes": "Safe default for product UIs where copy should feel polished but not animated."
    },
    "showcase": {
      "content": {
        "sample": "Quietly refined.",
        "samples": [
          "Quietly refined.",
          "Polished transitions.",
          "A soft close."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "scale-down-fade"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 20,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 520,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 374,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.22, 1, 0.36, 1)"
        },
        "exit": {
          "source_duration_ms": 380,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 274,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.64, 0, 0.78, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "whole",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "shared-axis-x": {
    "id": "shared-axis-x",
    "visibility": "hidden",
    "portable_spec": {
      "id": "shared-axis-x",
      "display_name": "Shared Axis X",
      "description": "Horizontal shared-axis transition for sibling destinations with continuity.",
      "inspiration": "Google Material shared axis (X) transitions.",
      "target": "whole",
      "signature_easing": "cubic-bezier(0.2, 0, 0, 1)",
      "enter": {
        "duration_ms": 500,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.2, 0, 0, 1)",
        "from": {
          "opacity": 0,
          "x_px": 24,
          "scale": 0.98
        },
        "to": {
          "opacity": 1,
          "x_px": 0,
          "scale": 1
        }
      },
      "exit": {
        "duration_ms": 360,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.4, 0, 1, 1)",
        "from": {
          "opacity": 1,
          "x_px": 0,
          "scale": 1
        },
        "to": {
          "opacity": 0,
          "x_px": -20,
          "scale": 0.98
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 120,
        "micro_delay_ms": 20
      },
      "usage_notes": "Use when moving between same-level views where horizontal direction conveys progress."
    },
    "showcase": null
  },
  "shared-axis-y": {
    "id": "shared-axis-y",
    "visibility": "visible",
    "portable_spec": {
      "id": "shared-axis-y",
      "display_name": "Word Cut Staircase",
      "description": "Per-word hard-cut transition with staircase timing for sharp editorial swaps.",
      "inspiration": "Hard-cut typography timing with stepped word sequencing.",
      "target": "per-word",
      "signature_easing": "steps(1, end)",
      "enter": {
        "duration_ms": 180,
        "stagger_ms": 78,
        "easing": "steps(1, end)",
        "from": {
          "opacity": 0,
          "y_px": 0,
          "scale": 1
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "scale": 1
        }
      },
      "exit": {
        "duration_ms": 140,
        "stagger_ms": 78,
        "easing": "steps(1, end)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "scale": 1
        },
        "to": {
          "opacity": 0,
          "y_px": 0,
          "scale": 1
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 0,
        "micro_delay_ms": 28
      },
      "usage_notes": "Use for bold word-by-word hard cuts. No overlap keeps phrase swaps visually clean."
    },
    "showcase": {
      "content": {
        "sample": "Layered navigation.",
        "samples": [
          "Layered navigation.",
          "Hierarchy made clear.",
          "Depth with restraint."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "shared-axis-y"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 28,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 180,
          "source_stagger_ms": 78,
          "scaled_duration_ms": 140,
          "scaled_stagger_ms": 56,
          "easing": "steps(1, end)"
        },
        "exit": {
          "source_duration_ms": 140,
          "source_stagger_ms": 78,
          "scaled_duration_ms": 140,
          "scaled_stagger_ms": 56,
          "easing": "steps(1, end)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-word",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "shared-axis-z": {
    "id": "shared-axis-z",
    "visibility": "visible",
    "portable_spec": {
      "id": "shared-axis-z",
      "display_name": "Shared Axis Z",
      "description": "Scale-based shared-axis transition for focus shifts and context depth.",
      "inspiration": "Google Material shared axis (Z), adapted for typography swaps.",
      "target": "whole",
      "signature_easing": "cubic-bezier(0.2, 0, 0, 1)",
      "enter": {
        "duration_ms": 520,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.2, 0, 0, 1)",
        "from": {
          "opacity": 0,
          "scale": 0.9,
          "blur_px": 2
        },
        "to": {
          "opacity": 1,
          "scale": 1,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 360,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.4, 0, 1, 1)",
        "from": {
          "opacity": 1,
          "scale": 1,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "scale": 1.06,
          "blur_px": 1
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 100,
        "micro_delay_ms": 20
      },
      "usage_notes": "Use for emphasizing focus transitions where scale communicates depth."
    },
    "showcase": {
      "content": {
        "sample": "Zooming between states.",
        "samples": [
          "Zooming between states.",
          "Elevate and settle.",
          "Scale with purpose."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "shared-axis-z"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 20,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 520,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 374,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.2, 0, 0, 1)"
        },
        "exit": {
          "source_duration_ms": 360,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 259,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.4, 0, 1, 1)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "whole",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "shimmer-sweep": {
    "id": "shimmer-sweep",
    "visibility": "visible",
    "portable_spec": {
      "id": "shimmer-sweep",
      "display_name": "Shimmer Sweep",
      "description": "A subtle sweep across a clean headline, blending in while gliding from left to center.",
      "inspiration": "Premium hero copy transitions where a short soft push is used before settle.",
      "target": "whole",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "enter": {
        "duration_ms": 850,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "x_px": -22,
          "blur_px": 8
        },
        "to": {
          "opacity": 1,
          "x_px": 0,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 650,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
        "from": {
          "opacity": 1,
          "x_px": 0,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "x_px": 22,
          "blur_px": 8
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 0,
        "micro_delay_ms": 36
      },
      "usage_notes": "Use as a premium micro-transition for title swaps and copy refreshes. This variant avoids overlap between outgoing and incoming text."
    },
    "showcase": {
      "content": {
        "sample": "Shiny details.",
        "samples": [
          "Shiny details.",
          "Glide with intent.",
          "Soft and precise."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "shimmer-sweep"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 36,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 850,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 612,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.22, 1, 0.36, 1)"
        },
        "exit": {
          "source_duration_ms": 650,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 468,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.7, 0, 0.84, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "whole",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "short-slide-down": {
    "id": "short-slide-down",
    "visibility": "visible",
    "portable_spec": {
      "id": "short-slide-down",
      "display_name": "Short Slide Down",
      "description": "Each new word drops in from above into its own line and pushes the existing stack downward until a centered three-line composition locks in place.",
      "inspiration": "Keynote-style editorial headings where motion is present but tightly restrained.",
      "target": "per-word",
      "custom_renderer": "kinetic-top-build",
      "signature_easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "enter": {
        "duration_ms": 520,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "from": {
          "opacity": 0,
          "y_px": -24,
          "blur_px": 2.4,
          "scale": 0.992
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0,
          "scale": 1
        }
      },
      "exit": {
        "duration_ms": 320,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.4, 0, 0.2, 1)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0,
          "scale": 1
        },
        "to": {
          "opacity": 0,
          "y_px": 10,
          "blur_px": 1.2,
          "scale": 1
        }
      },
      "build": {
        "first_word_duration_ms": 360,
        "push_duration_ms": 500,
        "exit_duration_ms": 320,
        "hold_ms": 1100,
        "between_phrases_ms": 180,
        "entry_offset_y_px": -28,
        "line_gap_px": 12,
        "first_word_y_px": -14,
        "entry_scale": 0.992,
        "entry_blur_px": 2.4,
        "reflow_blur_px": 0.7,
        "exit_y_px": 10,
        "exit_blur_px": 1.2,
        "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "exit_easing": "cubic-bezier(0.4, 0, 0.2, 1)"
      },
      "swap": {
        "mode": "sequential",
        "overlap_ms": 0,
        "micro_delay_ms": 70,
        "scenario_spec": {
          "entry_condition": "Use when three short words should build into a vertical stack, with each new word dropping from above and physically re-centering the composition.",
          "switch_order": [
            "Show the first word in the center with a short top-down drop.",
            "Bring the second word into a lower line while shifting the first word upward into the stack.",
            "Bring the third word into the bottom line while shifting the first two words upward so the final three-line stack stays centered."
          ],
          "verification": [
            "Each new word visibly pushes the existing words rather than simply fading in.",
            "The completed phrase ends as three centered lines with even vertical spacing.",
            "The motion reads as one kinetic stacked build with a top-down entry direction."
          ],
          "fallback": {
            "if_drop_is_too_subtle": "Increase build.entry_offset_y_px from -28 to -36.",
            "if_phrase_feels_too_slow": "Reduce build.push_duration_ms from 500 to 460."
          }
        }
      },
      "usage_notes": "Best on short three-word headings where each word can live on its own line. Keep the vertical drop compact so the motion still feels editorial, and let the stacking displacement carry most of the energy. For longer phrases, reduce entry_offset_y_px or switch to a softer shared-slide pattern."
    },
    "showcase": {
      "content": {
        "sample": "Build from above.",
        "phrases": [
          [
            "Drop",
            "into",
            "place"
          ],
          [
            "Words",
            "settle",
            "lower"
          ],
          [
            "Build",
            "from",
            "above"
          ]
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "short-slide-down"
      },
      "renderer": {
        "id": "kinetic-top-build",
        "source": "spec",
        "params": {
          "first_word_duration_ms": 360,
          "push_duration_ms": 500,
          "exit_duration_ms": 320,
          "hold_ms": 1100,
          "between_phrases_ms": 180,
          "entry_offset_y_px": -28,
          "line_gap_px": 12,
          "first_word_y_px": -14,
          "entry_scale": 0.992,
          "entry_blur_px": 2.4,
          "reflow_blur_px": 0.7,
          "exit_y_px": 10,
          "exit_blur_px": 1.2,
          "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
          "exit_easing": "cubic-bezier(0.4, 0, 0.2, 1)"
        },
        "recipe": {
          "id": "kinetic-top-build",
          "summary": "Build a centered vertical stack word by word; each incoming word drops from above and pushes existing words into newly centered y positions.",
          "required_measurements": [
            "offsetHeight for every word after appending the incoming word"
          ],
          "algorithm": [
            "Create a relative kinetic stack container using the kinetic-stack-host stage preset.",
            "For each phrase word, append an absolutely centered word span.",
            "Measure all child heights and compute centered y positions: totalHeight = sum(heights) + line_gap_px * (count - 1); cursor starts at -totalHeight / 2; each word position is cursor + height / 2.",
            "First word enters at y=first_word_y_px with entry_scale, entry_blur_px, and opacity 0, then settles to y=0/scale=1/blur=0/opacity=1.",
            "For later words, animate existing words from previous y positions to next centered y positions while the incoming word starts at targetY + entry_offset_y_px and lands at targetY.",
            "Use an intermediate keyframe around offset 0.52 for existing-word reflow blur and 0.6 for incoming-word settle blur.",
            "After every push, snap all words to exact final poses to avoid accumulated engine drift.",
            "Exit all words together from current centered y positions with exit_y_px and exit_blur_px, then clear the stack."
          ],
          "frame_materialization": {
            "coordinate_space": "x/y values are renderer pixel coordinates and are not multiplied by runtime.y_travel_multiplier.",
            "transform": "translate(-50%, -50%) translate3d(0, y, 0) scale(scale)",
            "filter": "blur(blur)",
            "opacity": "unit opacity"
          },
          "keyframe_recipe": {
            "first_word": [
              {
                "offset": 0,
                "x": 0,
                "y": "build.first_word_y_px",
                "scale": "build.entry_scale",
                "blur": "build.entry_blur_px",
                "opacity": 0
              },
              {
                "offset": 0.58,
                "x": 0,
                "y": "build.first_word_y_px * 0.35",
                "scale": 0.998,
                "blur": "build.entry_blur_px * 0.45",
                "opacity": 0.78
              },
              {
                "offset": 1,
                "x": 0,
                "y": 0,
                "scale": 1,
                "blur": 0,
                "opacity": 1
              }
            ],
            "existing_word_push": [
              {
                "offset": 0,
                "x": 0,
                "y": "currentY",
                "scale": 1,
                "blur": 0,
                "opacity": 1
              },
              {
                "offset": 0.52,
                "x": 0,
                "y": "mix(currentY, nextY, 0.58)",
                "scale": 1,
                "blur": "build.reflow_blur_px",
                "opacity": 1
              },
              {
                "offset": 1,
                "x": 0,
                "y": "nextY",
                "scale": 1,
                "blur": 0,
                "opacity": 1
              }
            ],
            "incoming_word_push": [
              {
                "offset": 0,
                "x": 0,
                "y": "targetY + build.entry_offset_y_px",
                "scale": "build.entry_scale",
                "blur": "build.entry_blur_px",
                "opacity": 0
              },
              {
                "offset": 0.6,
                "x": 0,
                "y": "mix(targetY + build.entry_offset_y_px, targetY, 0.72)",
                "scale": 0.998,
                "blur": "build.entry_blur_px * 0.38",
                "opacity": 0.84
              },
              {
                "offset": 1,
                "x": 0,
                "y": "targetY",
                "scale": 1,
                "blur": 0,
                "opacity": 1
              }
            ],
            "exit_word": [
              {
                "offset": 0,
                "x": 0,
                "y": "position",
                "scale": 1,
                "blur": 0,
                "opacity": 1
              },
              {
                "offset": 0.52,
                "x": 0,
                "y": "position + build.exit_y_px * 0.45",
                "scale": 1,
                "blur": "build.exit_blur_px * 0.55",
                "opacity": 0.62
              },
              {
                "offset": 1,
                "x": 0,
                "y": "position + build.exit_y_px",
                "scale": 1,
                "blur": "build.exit_blur_px",
                "opacity": 0
              }
            ]
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "build-phrase",
          "hold",
          "exit-phrase",
          "gap"
        ],
        "replacement_behavior": "phrase-loop",
        "hold_ms": 792,
        "micro_delay_ms": 0,
        "gap_ms": 130
      },
      "timing": {
        "first_word": {
          "source_duration_ms": 360,
          "scaled_duration_ms": 259,
          "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
        },
        "push": {
          "source_duration_ms": 500,
          "scaled_duration_ms": 360,
          "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
        },
        "exit": {
          "source_duration_ms": 320,
          "scaled_duration_ms": 230,
          "easing": "cubic-bezier(0.4, 0, 0.2, 1)"
        },
        "hold_ms": 792,
        "gap_ms": 130
      },
      "stage": {
        "preset": "kinetic-stack-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        },
        "kinetic_container": {
          "requirement": "Use a relative-positioned block host large enough for the stack; exact dimensions belong to the consuming UI.",
          "position": "relative",
          "coordinate_origin": "center"
        },
        "kinetic_word": {
          "backface_visibility": "hidden",
          "left": "50%",
          "position": "absolute",
          "top": "50%",
          "white_space": "nowrap",
          "absolute_centered": true,
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "kinetic-top-build",
        "target": "per-word",
        "stagger_mode": "normal",
        "coordinate_space": "renderer-pixels",
        "y_travel_multiplier": 1,
        "y_travel_multiplier_note": "runtime.y_travel_multiplier is not applied to kinetic build coordinates; x/y values in build params are final transform pixels.",
        "transform_order": "translate(-50%, -50%) translate3d(0, y_px, 0) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "follow renderer recipe algorithm"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Measure word heights after appending each incoming word.",
            "Compute centered y positions from measured heights and line_gap_px.",
            "Use raw renderer-pixel build x/y values; do not apply y_travel_multiplier to kinetic coordinates.",
            "Use renderer.recipe.keyframe_recipe exactly: existing-word reflow y is mix(currentY, nextY, 0.58) at offset 0.52; incoming-word settle y is mix(startY, targetY, 0.72) at offset 0.6.",
            "Exit uses a three-keyframe path with offset 0.52 at y = position + exit_y_px * 0.45 and opacity 0.62, not a two-keyframe fade."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Measure word heights after appending each incoming word.",
            "Compute centered y positions from measured heights and line_gap_px.",
            "Use raw renderer-pixel build x/y values; do not apply y_travel_multiplier to kinetic coordinates.",
            "Use renderer.recipe.keyframe_recipe exactly: existing-word reflow y is mix(currentY, nextY, 0.58) at offset 0.52; incoming-word settle y is mix(startY, targetY, 0.72) at offset 0.6.",
            "Exit uses a three-keyframe path with offset 0.52 at y = position + exit_y_px * 0.45 and opacity 0.62, not a two-keyframe fade."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Measure word heights after appending each incoming word.",
            "Compute centered y positions from measured heights and line_gap_px.",
            "Use raw renderer-pixel build x/y values; do not apply y_travel_multiplier to kinetic coordinates.",
            "Use renderer.recipe.keyframe_recipe exactly: existing-word reflow y is mix(currentY, nextY, 0.58) at offset 0.52; incoming-word settle y is mix(startY, targetY, 0.72) at offset 0.6.",
            "Exit uses a three-keyframe path with offset 0.52 at y = position + exit_y_px * 0.45 and opacity 0.62, not a two-keyframe fade."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "All engines",
          "notes": [
            "Do not apply runtime.y_travel_multiplier to kinetic build x/y coordinates; buildKineticFrame uses the build params as final transform pixels.",
            "Use explicit offset keyframes for the intermediate reflow frames, then snap final styles after each push to avoid layout drift."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect builds a centered vertical stack. Measure line heights, compute centered y positions for the stack, and animate existing words upward as the incoming word drops into the next line.",
        "For site parity, scale duration and stagger timing by 0.72. Keep kinetic build x/y params as raw renderer pixel coordinates; runtime.y_travel_multiplier applies to generic/title frame conversion, not to buildKineticFrame coordinates.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "short-slide-right": {
    "id": "short-slide-right",
    "visibility": "visible",
    "portable_spec": {
      "id": "short-slide-right",
      "display_name": "Short Slide Right",
      "description": "The whole phrase glides in from the left as one compact move, while the words themselves are revealed in sequence only through opacity.",
      "inspiration": "Keynote-style editorial headings where motion is present but tightly restrained.",
      "target": "per-word",
      "custom_renderer": "shared-slide-opacity-stage",
      "signature_easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "enter": {
        "duration_ms": 520,
        "stagger_ms": 92,
        "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "from": {
          "opacity": 1,
          "x_px": -24,
          "blur_px": 1.2
        },
        "to": {
          "opacity": 1,
          "x_px": 0,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 320,
        "stagger_ms": 0,
        "easing": "cubic-bezier(0.4, 0, 0.2, 1)",
        "from": {
          "opacity": 1,
          "x_px": 0,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "x_px": 12,
          "blur_px": 1
        }
      },
      "build": {
        "word_opacity_duration_ms": 210,
        "word_opacity_from": 0,
        "word_opacity_to": 1
      },
      "swap": {
        "mode": "sequential",
        "overlap_ms": 0,
        "micro_delay_ms": 70,
        "scenario_spec": {
          "entry_condition": "Use when the heading should feel like one shared horizontal motion, but the words should reveal progressively.",
          "switch_order": [
            "Start the whole phrase from one shared left offset.",
            "Animate the phrase transform once, with no per-word positional delay.",
            "Reveal each word with only opacity stagger so the ordering reads clearly."
          ],
          "verification": [
            "The phrase position starts and ends in sync for all words.",
            "Only opacity is staggered across the words.",
            "The amplitude stays compact enough to feel controlled, not swishy."
          ],
          "fallback": {
            "if_motion_feels_too_wide": "Reduce enter.from.x_px from -24 to -18.",
            "if_reveal_reads_too_fast": "Increase enter.stagger_ms from 92 to 108.",
            "if_words_feel_too_ghosted": "Increase build.word_opacity_duration_ms from 210 to 240."
          }
        }
      },
      "usage_notes": "Best on three-word headings where word order matters. Keep the horizontal travel compact and shared; the phrase should read as one move, with staging communicated only by opacity. For longer phrases, reduce stagger_ms or shorten the opacity duration so the cascade does not drag."
    },
    "showcase": {
      "content": {
        "sample": "Move with intent.",
        "samples": [
          "Move with intent.",
          "Words glide across.",
          "Build the rhythm."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "short-slide-right"
      },
      "renderer": {
        "id": "shared-slide-opacity-stage",
        "source": "spec",
        "params": {
          "word_opacity_duration_ms": 210,
          "word_opacity_from": 0,
          "word_opacity_to": 1
        },
        "recipe": {
          "id": "shared-slide-opacity-stage",
          "summary": "Move the full phrase as one title-level transform while staggering only word opacity.",
          "required_dom": [
            "one h3.text-animation-title for the full phrase transform",
            "word spans are nested inside the title and only receive opacity animation"
          ],
          "algorithm": [
            "Split text as per-word by default.",
            "Apply titleFrame(enter.from) to the h3 and word_opacity_from to each word span.",
            "Start the h3 transform animation and every word opacity animation in the same tick; do not wait for the title transform to finish before starting word opacity.",
            "Animate the h3 once from enter.from to enter.to using scaled enter duration.",
            "Animate every word opacity from word_opacity_from to word_opacity_to with index * scaled enter.stagger_ms delay.",
            "Hold, then animate only the h3 from exit.from to exit.to, clear the stage, wait gap_ms, advance to the next phrase, and repeat."
          ],
          "frame_materialization": {
            "title_transform": "translate3d(x_px, y_px * runtime.y_travel_multiplier, 0) scale(scale)",
            "title_filter": "blur(blur_px)",
            "word_animation_properties": [
              "opacity"
            ]
          },
          "initial_state": {
            "before_enter": [
              "Set the title element to titleFrame(enter.from).",
              "Set every non-space word span opacity to build.word_opacity_from before starting any enter tween.",
              "Whitespace spans should preserve layout but do not receive opacity tweens."
            ],
            "before_exit": [
              "Set the title element to titleFrame(exit.from)."
            ]
          },
          "verification": [
            "A GSAP implementation must call gsap.set(wordNodes, { opacity: word_opacity_from }) or assign equivalent inline styles before gsap.to(wordNodes, { opacity: word_opacity_to, ... }).",
            "A Motion implementation must initialize every word span opacity to word_opacity_from before animate(... opacity: [word_opacity_from, word_opacity_to] ...).",
            "A loop implementation must preserve exit and gap timing; an enter-only reveal is not an exact reproduction."
          ]
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 0,
        "gap_ms": 320
      },
      "timing": {
        "enter_title": {
          "source_duration_ms": 520,
          "source_stagger_ms": 92,
          "scaled_duration_ms": 374,
          "scaled_stagger_ms": 66,
          "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
        },
        "enter_word_opacity": {
          "source_duration_ms": 210,
          "scaled_duration_ms": 151,
          "delay_step_ms": 66,
          "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
        },
        "exit_title": {
          "source_duration_ms": 320,
          "source_stagger_ms": 0,
          "scaled_duration_ms": 230,
          "scaled_stagger_ms": 0,
          "easing": "cubic-bezier(0.4, 0, 0.2, 1)"
        },
        "total_formulas": {
          "enter_total_ms": "enter_title.scaled_duration_ms",
          "exit_total_ms": "exit_title.scaled_duration_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "shared-slide-opacity-stage",
        "target": "per-word",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "follow renderer recipe algorithm"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Animate the title-level transform and every word opacity animation concurrently.",
            "Before starting enter animations, set every non-space word span to build.word_opacity_from; otherwise the opacity reveal will be invisible.",
            "For GSAP, call gsap.set(wordNodes, { opacity: build.word_opacity_from }) before one batched gsap.to(wordNodes, { opacity: build.word_opacity_to, stagger, ... }) tween; do not create one opacity tween per word unless the delays are non-uniform.",
            "For Motion, assign style.opacity = build.word_opacity_from before animate(wordNode, { opacity: [from, to] }, ...).",
            "Use enter_title for the phrase transform and enter_word_opacity for word fades.",
            "Exit animates only the title-level frame, then clears/replaces content according to playback.",
            "Do not ship an enter-only reveal when exact playback is requested; include hold, exit, gap, phrase advance, cancellation, and final-frame snapping."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Animate the title-level transform and every word opacity animation concurrently.",
            "Before starting enter animations, set every non-space word span to build.word_opacity_from; otherwise the opacity reveal will be invisible.",
            "For GSAP, call gsap.set(wordNodes, { opacity: build.word_opacity_from }) before one batched gsap.to(wordNodes, { opacity: build.word_opacity_to, stagger, ... }) tween; do not create one opacity tween per word unless the delays are non-uniform.",
            "For Motion, assign style.opacity = build.word_opacity_from before animate(wordNode, { opacity: [from, to] }, ...).",
            "Use enter_title for the phrase transform and enter_word_opacity for word fades.",
            "Exit animates only the title-level frame, then clears/replaces content according to playback.",
            "Do not ship an enter-only reveal when exact playback is requested; include hold, exit, gap, phrase advance, cancellation, and final-frame snapping."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Animate the title-level transform and every word opacity animation concurrently.",
            "Before starting enter animations, set every non-space word span to build.word_opacity_from; otherwise the opacity reveal will be invisible.",
            "For GSAP, call gsap.set(wordNodes, { opacity: build.word_opacity_from }) before one batched gsap.to(wordNodes, { opacity: build.word_opacity_to, stagger, ... }) tween; do not create one opacity tween per word unless the delays are non-uniform.",
            "For Motion, assign style.opacity = build.word_opacity_from before animate(wordNode, { opacity: [from, to] }, ...).",
            "Use enter_title for the phrase transform and enter_word_opacity for word fades.",
            "Exit animates only the title-level frame, then clears/replaces content according to playback.",
            "Do not ship an enter-only reveal when exact playback is requested; include hold, exit, gap, phrase advance, cancellation, and final-frame snapping."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect moves the full phrase as one shared horizontal transform. Preserve a single phrase-level translation and reveal word order only through opacity timing.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "soft-blur-in": {
    "id": "soft-blur-in",
    "visibility": "visible",
    "portable_spec": {
      "id": "soft-blur-in",
      "display_name": "Soft Blur",
      "description": "Per-character fade-in with a gentle blur and upward motion. Apple's signature hero-title reveal.",
      "inspiration": "Apple keynote intros; iPhone, Mac, and Vision Pro product page headlines; macOS system UI reveals.",
      "target": "per-character",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "enter": {
        "duration_ms": 900,
        "stagger_ms": 25,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "y_px": 16,
          "blur_px": 12
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 600,
        "stagger_ms": 15,
        "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -16,
          "blur_px": 12
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 300,
        "scenario_spec": {
          "entry_condition": "Use when text is replaced in the same layout slot and both strings remain visually stable in one block.",
          "switch_order": [
            "Start old text exit at t=0ms.",
            "Start new text enter at t=exit_total_ms-overlap_ms.",
            "Keep both text layers mounted only during the overlap window."
          ],
          "verification": [
            "No hard-cut frame appears between old and new text.",
            "Blur stays readable during overlap on desktop and mobile.",
            "Total swap duration remains below 1300ms for default sample length."
          ],
          "fallback": {
            "if_overlap_looks_heavy": "Reduce overlap_ms to 180 and exit blur_px to 8.",
            "if_copy_is_long": "Switch target to per-word and reduce enter stagger_ms to 15."
          }
        }
      },
      "usage_notes": "Works best on hero titles 48px+ against solid backgrounds. On body text (<24px), reduce blur_px to 6 and stagger_ms to 15. Avoid on very long strings (>40 chars) — total stagger becomes too long; in that case switch target to 'per-word'."
    },
    "showcase": {
      "content": {
        "sample": "Think different.",
        "samples": [
          "Think different.",
          "Built to flow.",
          "Motion with intent."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "soft-blur-in"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 0,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 900,
          "source_stagger_ms": 25,
          "scaled_duration_ms": 648,
          "scaled_stagger_ms": 18,
          "easing": "cubic-bezier(0.22, 1, 0.36, 1)"
        },
        "exit": {
          "source_duration_ms": 600,
          "source_stagger_ms": 15,
          "scaled_duration_ms": 432,
          "scaled_stagger_ms": 11,
          "easing": "cubic-bezier(0.64, 0, 0.78, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-character",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "spring-scale-in": {
    "id": "spring-scale-in",
    "visibility": "visible",
    "portable_spec": {
      "id": "spring-scale-in",
      "display_name": "Spring Scale In",
      "description": "Words pop in with a soft overshoot scale, like a physical spring settling into place.",
      "inspiration": "iOS app icons bouncing into the home screen, macOS Dock, widget appearances, Vision Pro floating UI pops.",
      "target": "per-word",
      "signature_easing": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      "enter": {
        "duration_ms": 360,
        "stagger_ms": 95,
        "easing": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "from": {
          "opacity": 0,
          "scale": 0.7
        },
        "to": {
          "opacity": 1,
          "scale": 1
        }
      },
      "exit": {
        "duration_ms": 200,
        "stagger_ms": 80,
        "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
        "from": {
          "opacity": 1,
          "scale": 1
        },
        "to": {
          "opacity": 0,
          "scale": 0.8
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 0,
        "micro_delay_ms": 35
      },
      "usage_notes": "The overshoot comes from cubic-bezier y2 > 1 (1.56). Per-word is the sweet spot - per-character at this easing feels too bouncy. Stagger is intentionally high here to create a visible staircase effect. This variant uses no overlap on swap to avoid content crossing during transitions."
    },
    "showcase": {
      "content": {
        "sample": "Fast. Crisp. Fluid.",
        "samples": [
          "Fast. Crisp. Fluid.",
          "Pop into place.",
          "Smooth by default."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "spring-scale-in"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 35,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 360,
          "source_stagger_ms": 95,
          "scaled_duration_ms": 259,
          "scaled_stagger_ms": 68,
          "easing": "cubic-bezier(0.34, 1.56, 0.64, 1)"
        },
        "exit": {
          "source_duration_ms": 200,
          "source_stagger_ms": 80,
          "scaled_duration_ms": 144,
          "scaled_stagger_ms": 58,
          "easing": "cubic-bezier(0.7, 0, 0.84, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-word",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "stagger-from-center": {
    "id": "stagger-from-center",
    "visibility": "hidden",
    "portable_spec": {
      "id": "stagger-from-center",
      "display_name": "Stagger from Center",
      "description": "Characters reveal from the center outward to emphasize the keyword core.",
      "inspiration": "Product hero typography where center-weighted emphasis drives attention.",
      "target": "per-character",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "stagger_mode": "center-out",
      "enter": {
        "duration_ms": 620,
        "stagger_ms": 22,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "y_px": 12,
          "blur_px": 3
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 420,
        "stagger_ms": 16,
        "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -8,
          "blur_px": 3
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 150,
        "micro_delay_ms": 20
      },
      "usage_notes": "Use on short words or compact titles; long text reduces the center-emphasis effect."
    },
    "showcase": null
  },
  "stagger-from-edges": {
    "id": "stagger-from-edges",
    "visibility": "hidden",
    "portable_spec": {
      "id": "stagger-from-edges",
      "display_name": "Stagger from Edges",
      "description": "Characters start from both edges and converge toward the center.",
      "inspiration": "Directional typography reveals used in modern product hero systems.",
      "target": "per-character",
      "signature_easing": "cubic-bezier(0.22, 1, 0.36, 1)",
      "stagger_mode": "edges-in",
      "enter": {
        "duration_ms": 620,
        "stagger_ms": 22,
        "easing": "cubic-bezier(0.22, 1, 0.36, 1)",
        "from": {
          "opacity": 0,
          "y_px": 12,
          "blur_px": 3
        },
        "to": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        }
      },
      "exit": {
        "duration_ms": 420,
        "stagger_ms": 16,
        "easing": "cubic-bezier(0.64, 0, 0.78, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0,
          "blur_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -8,
          "blur_px": 3
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 150,
        "micro_delay_ms": 20
      },
      "usage_notes": "Effective for medium word lengths where edge-to-center motion remains readable."
    },
    "showcase": null
  },
  "top-down-letters": {
    "id": "top-down-letters",
    "visibility": "visible",
    "portable_spec": {
      "id": "top-down-letters",
      "display_name": "Top-Down Letters",
      "description": "Letters descend from above in a pronounced staircase, one symbol at a time, with zero blur.",
      "inspiration": "Apple-style keynote typography, crisp editorial headers, and controlled top-down word reveals.",
      "target": "per-character",
      "signature_easing": "cubic-bezier(0.18, 1, 0.32, 1)",
      "enter": {
        "duration_ms": 400,
        "stagger_ms": 88,
        "easing": "cubic-bezier(0.18, 1, 0.32, 1)",
        "from": {
          "opacity": 0,
          "y_px": -46
        },
        "to": {
          "opacity": 1,
          "y_px": 0
        }
      },
      "exit": {
        "duration_ms": 280,
        "stagger_ms": 28,
        "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": 14
        }
      },
      "swap": {
        "mode": "sequential",
        "overlap_ms": 0,
        "micro_delay_ms": 35,
        "scenario_spec": {
          "entry_condition": "Use when short words or compact headlines should build downward letter by letter with completely crisp glyph edges.",
          "switch_order": [
            "Run old text exit first so the slot clears cleanly.",
            "Wait micro_delay_ms after exit.",
            "Start new text enter from above with per-character stagger."
          ],
          "verification": [
            "Letters never blur during enter or exit.",
            "The reveal clearly reads top-down rather than typewriter-left-to-right.",
            "Spacing remains stable while characters settle."
          ],
          "fallback": {
            "if_motion_feels_too_tall": "Reduce enter from.y_px from -46 to -36.",
            "if_readability_drops": "Increase stagger_ms from 88 to 100 for even more separation."
          }
        }
      },
      "usage_notes": "Best for short single words, labels, or compact headline swaps at 40px+. This is the top-down counterpart to bottom-up-letters: very large per-symbol delay, fewer simultaneous letters on screen, and a tall drop from above."
    },
    "showcase": {
      "content": {
        "sample": "Signal",
        "samples": [
          "Signal",
          "Header",
          "Vector"
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "top-down-letters"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 35,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 400,
          "source_stagger_ms": 88,
          "scaled_duration_ms": 288,
          "scaled_stagger_ms": 63,
          "easing": "cubic-bezier(0.18, 1, 0.32, 1)"
        },
        "exit": {
          "source_duration_ms": 280,
          "source_stagger_ms": 28,
          "scaled_duration_ms": 202,
          "scaled_stagger_ms": 20,
          "easing": "cubic-bezier(0.7, 0, 0.84, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-character",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  },
  "typewriter": {
    "id": "typewriter",
    "visibility": "visible",
    "portable_spec": {
      "id": "typewriter",
      "display_name": "Typewriter",
      "description": "Per-character stepped reveal with a minimal editorial typing rhythm.",
      "inspiration": "System-like text build patterns in Apple presentation and utility UI.",
      "target": "per-character",
      "signature_easing": "steps(1, end)",
      "enter": {
        "duration_ms": 240,
        "stagger_ms": 46,
        "easing": "steps(1, end)",
        "from": {
          "opacity": 0,
          "y_px": 0
        },
        "to": {
          "opacity": 1,
          "y_px": 0
        }
      },
      "exit": {
        "duration_ms": 260,
        "stagger_ms": 10,
        "easing": "cubic-bezier(0.7, 0, 0.84, 0)",
        "from": {
          "opacity": 1,
          "y_px": 0
        },
        "to": {
          "opacity": 0,
          "y_px": -4
        }
      },
      "swap": {
        "mode": "crossfade",
        "overlap_ms": 0,
        "micro_delay_ms": 85
      },
      "usage_notes": "Good for short copy. Keep line length moderate so stepping stays intentional."
    },
    "showcase": {
      "content": {
        "sample": "Precision in motion.",
        "samples": [
          "Precision in motion.",
          "Write. Pause. Continue."
        ]
      },
      "content_usage": {
        "default_policy": "When applying an effect to an existing heading or text section, preserve the section text. Do not replace user/application copy with showcase sample text unless the user explicitly asks to reproduce the demo copy.",
        "showcase_samples": "showcase.content.sample and samples are reference/demo copy used by the generated website examples and useful fallback copy for isolated demos.",
        "loop_policy": "If the existing section supplies multiple phrases, loop those phrases. If it supplies one phrase, animate that phrase with the same enter/exit playback or use explicitly provided alternate phrases."
      },
      "sample_source": {
        "asset": "assets/samples.json",
        "key": "typewriter"
      },
      "renderer": {
        "id": "generic-stagger",
        "source": "default",
        "params": {},
        "recipe": {
          "id": "generic-stagger",
          "summary": "Split text by target, animate each animated unit from enter.from to enter.to, hold, animate current units from exit.from to exit.to, then replace content.",
          "required_dom": [
            "one h3.text-animation-title per phrase",
            "one span.text-animation-unit per split part",
            "animate only non-space parts for per-word targets",
            "span.text-animation-unit.line uses display:block for per-line targets"
          ],
          "split_rules": {
            "whole": "single animated unit containing the full text",
            "per-character": "Array.from(text), preserving punctuation and spaces as animated visual units",
            "per-word": "regex /(\\S+|\\s+)/g; create spans for words and whitespace, but animate only non-whitespace spans",
            "per-line": "split on explicit \"\\n\"; each line is an animated block span"
          },
          "stagger_rank_algorithms": {
            "normal": "rank equals DOM unit index",
            "reverse": "rank 0 starts at last animated unit and proceeds backward",
            "center-out": "sort animated indices by absolute distance from center, ties by lower index",
            "edges-in": "alternate left edge, right edge, then move inward"
          },
          "frame_materialization": {
            "transform_order": "translate3d(x_px, y_px * runtime.y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
            "filter": "blur(blur_px)",
            "opacity_default": 1,
            "scale_default": 1,
            "letter_spacing": "for per-character targets, split letter_spacing_em across marginLeft/marginRight halves on glyphs; otherwise assign letterSpacing directly",
            "fill": "final frame must remain applied after each phase completes"
          },
          "loop_algorithm": [
            "Wait initial_delay_ms before starting the first enter.",
            "Create current phrase, apply enter.from to every animated unit, append it, then animate enter.",
            "After the first enter completes, wait hold_ms.",
            "Loop from the visible phrase: animate current units through exit.",
            "Create next phrase off-DOM and apply enter.from.",
            "After the exit completes, wait micro_delay_ms.",
            "Replace the stage contents with the next phrase and animate enter.",
            "After the next enter completes, wait gap_ms.",
            "Continue the loop by exiting the currently visible phrase; do not run another enter for a phrase that is already visible."
          ],
          "canonical_loop_pseudocode": [
            "current = createPhrase(firstText); append(current); await enter(current);",
            "while active:",
            "  await sleep(hold_ms);",
            "  await exit(current);",
            "  next = createPhrase(nextText); applyEnterFrom(next);",
            "  await sleep(micro_delay_ms);",
            "  replaceStage(next);",
            "  current = next;",
            "  await enter(current);",
            "  await sleep(gap_ms);",
            "Do not put await enter(current) at the top of the while loop; that double-enters the phrase that just entered before gap_ms."
          ],
          "loop_invariants": [
            "The initial phrase enters exactly once before the loop body.",
            "Every later phrase enters exactly once immediately after replacement.",
            "If implementation awaits an animation or tween promise, do not also sleep for that phase total; use either await completion or sleep(total), not both.",
            "Do not implement an enter-only demo when exact playback is requested; preserve exit, replacement, micro-delay, gap, cancellation, and final-frame snapping."
          ],
          "current_site_swap_support": {
            "uses_micro_delay_ms": true,
            "uses_overlap_ms": false,
            "branches_on_swap_mode": false,
            "note": "The portable swap block may describe broader intent; the current site showcase uses the playback recipe here as the exact behavior."
          }
        }
      },
      "runtime": {
        "preset": "website-default",
        "speed_multiplier": 0.72,
        "hold_ms": 550,
        "gap_ms": 320,
        "y_travel_multiplier": 0.58,
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        }
      },
      "playback": {
        "kind": "loop",
        "cycle": [
          "enter",
          "hold",
          "exit",
          "micro-delay",
          "gap"
        ],
        "replacement_behavior": "exit-before-enter",
        "hold_ms": 550,
        "micro_delay_ms": 85,
        "gap_ms": 320
      },
      "timing": {
        "enter": {
          "source_duration_ms": 240,
          "source_stagger_ms": 46,
          "scaled_duration_ms": 173,
          "scaled_stagger_ms": 33,
          "easing": "steps(1, end)"
        },
        "exit": {
          "source_duration_ms": 260,
          "source_stagger_ms": 10,
          "scaled_duration_ms": 187,
          "scaled_stagger_ms": 7,
          "easing": "cubic-bezier(0.7, 0, 0.84, 0)"
        },
        "total_formulas": {
          "enter_total_ms": "enter.scaled_duration_ms + max(0, animated_unit_count - 1) * enter.scaled_stagger_ms",
          "exit_total_ms": "exit.scaled_duration_ms + max(0, animated_unit_count - 1) * exit.scaled_stagger_ms"
        }
      },
      "stage": {
        "preset": "default-text-host",
        "purpose": "Animation-only host requirements. Typography, color, card chrome, padding, and responsive sizing are intentionally excluded so the skill stays portable.",
        "container": {
          "requirement": "Provide a host element for the animated title.",
          "perspective_px": 900,
          "perspective_note": "Needed when effects use z_px, rotate_x_deg, or rotate_y_deg. Host layout and size are application-owned."
        },
        "title": {
          "requirement": "Animate the phrase container when the renderer recipe uses title frames.",
          "display": "inline-block",
          "transform_style": "preserve-3d",
          "layout_note": "Do not force flex-direction: column on the title globally; line breaks come from span.text-animation-unit.line using display:block."
        },
        "unit": {
          "backface_visibility": "hidden",
          "display": "inline-block",
          "line_display": "block",
          "transform_origin": "50% 55%",
          "white_space": "pre",
          "will_change": [
            "transform",
            "opacity",
            "filter"
          ]
        }
      },
      "rendering_contract": {
        "renderer": "generic-stagger",
        "target": "per-character",
        "stagger_mode": "normal",
        "y_travel_multiplier": 0.58,
        "transform_order": "translate3d(x_px, y_px * y_travel_multiplier, z_px) rotateX(rotate_x_deg) rotateY(rotate_y_deg) rotate(rotate_deg) scale(scale)",
        "fill_behavior": "retain final frame after each phase",
        "initial_delay_ms": {
          "mode": "random-range",
          "min": 0,
          "max": 400
        },
        "content_replacement": "current phrase is cleared and replaced only after exit_total_ms + micro_delay_ms"
      },
      "library_selection": {
        "supported_adapters": [
          "waapi",
          "motion",
          "gsap"
        ],
        "aliases": {
          "web animations api": "waapi",
          "waapi": "waapi",
          "motion": "motion",
          "motion.dev": "motion",
          "motion react": "motion",
          "framer motion": "motion",
          "gsap": "gsap",
          "greensock": "gsap"
        },
        "rule": "If the user names a target animation library, use only the matching adapter for that effect. Do not silently substitute Motion for GSAP, GSAP for Motion, or WAAPI for either library. If a requested library is unsupported, state that limitation before implementing.",
        "verification": "For generated code, verify imports and animation calls match the selected adapter: Motion should import/use animate from motion/react and not Element.animate/gsap, GSAP should import/use gsap and CustomEase and not Motion/Element.animate, and WAAPI should use Element.animate without a third-party animation import."
      },
      "library_adapters": {
        "waapi": {
          "target_library": "Web Animations API",
          "install": "none; native browser Element.animate",
          "import_statement": null,
          "time_unit": "milliseconds",
          "start_animation": "element.animate(keyframes, { delay: delay_ms, duration: duration_ms, easing, fill: \"forwards\" })",
          "keyframe_shape": "Use CSS-style Keyframe[] objects with transform, filter, opacity, letterSpacing, and optional offset fields.",
          "easing": "Pass CSS easing strings directly, including cubic-bezier(...) and steps(...).",
          "completion": "await animation.finished, then assign the final keyframe styles before replacing content.",
          "cancellation": "cancel active Animation objects and clear pending timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "motion": {
          "target_library": "Motion for React / motion.dev",
          "install": "pnpm add motion",
          "import_statement": "import { animate, cubicBezier, steps } from \"motion/react\";",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "animate(element, propertyKeyframes, { delay: delay_ms / 1000, duration: duration_ms / 1000, ease, times })",
          "keyframe_shape": "Convert Keyframe[] into property arrays, for example { opacity: [0, 1], transform: [\"...\", \"...\"], filter: [\"...\", \"...\"] }. Convert keyframe offset values into the times array.",
          "verification": [
            "When offsets are present, pass times in the Motion options object, not inside the propertyKeyframes object.",
            "The Motion times array length must match each animated property array length for that tween.",
            "Motion TypeScript may reject CSS transform/filter property arrays; use a local typed helper/cast at the animate boundary instead of changing the keyframe shape.",
            "Exact reproduction must include exit/replacement playback, not only initial enter tweens."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) to cubicBezier(a,b,c,d). Convert steps(n,start|end) to steps(n, \"start\"|\"end\"). Map CSS ease-in/ease-out/ease-in-out to Motion easeIn/easeOut/easeInOut.",
          "completion": "Use controls.then(...) or await the returned controls in an async loop, then assign final styles before content replacement.",
          "cancellation": "call controls.stop?.() and controls.cancel?.() for active Motion animations when available, and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        },
        "gsap": {
          "target_library": "GSAP",
          "install": "pnpm add gsap",
          "import_statement": "import { gsap } from \"gsap\"; import { CustomEase } from \"gsap/CustomEase\"; gsap.registerPlugin(CustomEase);",
          "time_unit": "seconds for delay and duration options",
          "start_animation": "gsap.set(element, firstKeyframe); gsap.to(element, { keyframes: remainingKeyframesWithSegmentDurations, delay: delay_ms / 1000, ease, overwrite: \"auto\" })",
          "keyframe_shape": "Use GSAP property objects with transform, filter, opacity, letterSpacing. For offset keyframes, convert adjacent offset gaps into absolute per-keyframe segment durations in seconds.",
          "verification": [
            "Initialize first-frame styles with gsap.set before starting a tween.",
            "Do not pass both per-keyframe segment durations and a top-level gsap.to duration; that retimes the tween and makes the GSAP reproduction feel slower than the spec.",
            "For renderer keyframe_recipe offsets, use GSAP keyframes with equivalent segment durations or a timeline that preserves the same absolute offsets.",
            "For generic-stagger loops, do not enter the same visible phrase twice; after gap, the next action is exit of the current phrase."
          ],
          "easing": "Convert cubic-bezier(a,b,c,d) with CustomEase.create(...). Use \"none\" for linear. Convert steps(n,end) to GSAP steps(n).",
          "completion": "Wrap tweens/timelines in a Promise resolved by onComplete, then assign final styles before replacing content.",
          "cancellation": "kill active tweens/timelines and clear timers on teardown.",
          "renderer_notes": [
            "Create split units from target and animate only the animated units.",
            "Delay each unit by stagger rank * scaled_stagger_ms.",
            "Use materialized transform/filter/opacity keyframes from rendering_contract.transform_order.",
            "Implement the complete playback loop from renderer.recipe.loop_algorithm: initial enter once, hold, exit current, micro-delay, replace next, enter next, gap, then exit that visible phrase.",
            "Do not restart enter on a phrase that is already visible after gap; the next cycle starts with exit for the current phrase.",
            "When awaiting animation completion promises, wait hold_ms/micro_delay_ms/gap_ms only; do not also sleep enter_total_ms or exit_total_ms.",
            "Reject the code shape `while (...) { await enter(current); ... await enter(next); await sleep(gap); }`; it double-enters the visible phrase. Use renderer.recipe.canonical_loop_pseudocode instead."
          ]
        }
      },
      "engine_notes": [
        {
          "engine": "WAAPI",
          "notes": [
            "Use Element.animate(keyframes, { delay, duration, easing, fill: \"forwards\" }).",
            "For multi-keyframe effects, keep offsets on the keyframes and apply easing at the animation options level to match the site runtime."
          ]
        },
        {
          "engine": "Motion",
          "notes": [
            "Use imperative animate(element, keyframes, options) when reproducing the site loops.",
            "Convert CSS cubic-bezier strings to cubicBezier(x1, y1, x2, y2), convert steps(n, start|end) to steps(n, direction), and pass explicit times for keyframe offsets."
          ]
        },
        {
          "engine": "GSAP",
          "notes": [
            "Register CustomEase for CSS cubic-bezier curves; map linear to ease \"none\" and steps(n, end) to GSAP steps(n).",
            "For multi-keyframe effects, convert offset gaps into per-keyframe segment durations in seconds and keep one tween-level ease. Do not also pass a top-level duration when segment durations are present."
          ]
        },
        {
          "engine": "CSS",
          "notes": [
            "CSS keyframes are viable for simple generic-stagger effects if every unit gets the same keyframes and computed delay.",
            "CSS alone is usually not sufficient for the site loop unless JavaScript handles content replacement timing."
          ]
        }
      ],
      "reproduction_notes": [
        "On the site this effect uses the generic stagger renderer. Apply the portable enter and exit frames per animated unit, preserving the declared target split and stagger ordering.",
        "For site parity, scale duration and stagger timing by 0.72 and scale vertical travel by 0.58. These runtime transforms materially affect the perceived pace and distance.",
        "For exact animation reproduction, follow `showcase.playback`, `showcase.timing`, `showcase.rendering_contract`, and `showcase.stage` over assumptions inferred from the portable contract alone. Presentation styling such as font size, font weight, color, padding, and card chrome is intentionally application-owned."
      ]
    }
  }
}
};
