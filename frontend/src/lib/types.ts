export interface EducationItem {
  school: string;
  degree: string;
  major: string;
  duration: string;
  courses: string[];
}

export interface ResumeData {
  name: string;
  education_background: EducationItem[];
  skills: string[];
  work_years: number;
  certificates: string[];
  work_experience: { company: string; position: string; duration: string }[];
  projects: { name: string; role: string; description: string; tech_stack: string[] }[];
  internships: { company: string; position: string; duration: string; description: string }[];
  raw_text?: string;
  confirmed?: boolean;
}

export interface MemoryData {
  career_interests: string;
  skills_self_assessment: string;
  values_field: string;
  current_stage: string;
  target_position: string;
  concerns: string;
  free_notes: string;
}

export interface ReportData {
  id: number;
  target_position: string;
  match_score: number;
  match_summary?: string;
  skill_gaps: { skill: string; gap_level: string; description: string; source: string }[];
  recommended_directions: { direction: string; reason: string; source: string }[];
  roadmap: {
    title: string;
    steps: { order: number; title: string; description: string; duration: string; resources: string[] }[];
  };
  sources: { type: string; content: string }[];
  created_at: string;
}

export interface Thread {
  thread_id: string;
  title: string;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "assistant-streaming";
  content: string;
}
