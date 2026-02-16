import {
  Brain,
  Briefcase,
  Flame,
  HandHeart,
  MessageCircle,
  Rocket,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import type { AssistantMode, PageId } from "../../types/pal";

export const NAV_ITEMS: Array<{ id: PageId; label: string; icon: string }> = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "history", label: "History", icon: "◴" },
  { id: "stats", label: "Stats", icon: "◫" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "about", label: "About", icon: "◎" },
];

export const MODE_OPTIONS: Array<{
  id: AssistantMode;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "advisor",
    label: "Advisor",
    description: "Direct, practical guidance",
    icon: Briefcase,
  },
  {
    id: "therapist",
    label: "Therapist",
    description: "Empathetic and reflective",
    icon: HandHeart,
  },
  {
    id: "sassy",
    label: "Sassy",
    description: "Playful and witty tone",
    icon: Sparkles,
  },
  {
    id: "chatty",
    label: "Chatty",
    description: "Warm and conversational",
    icon: MessageCircle,
  },
  {
    id: "coach",
    label: "Coach",
    description: "High-energy accountability and execution",
    icon: Flame,
  },
  {
    id: "analyst",
    label: "Analyst",
    description: "Structured, data-focused and precise",
    icon: Brain,
  },
  {
    id: "creative",
    label: "Creative",
    description: "Imaginative ideation with practical options",
    icon: Rocket,
  },
  {
    id: "guardian",
    label: "Guardian",
    description: "Risk-aware, cautious and safety-first",
    icon: ShieldCheck,
  },
];

export const MAX_IMPORT_SIZE_BYTES = 1024 * 1024;
