// Gong API Types

// Authentication
export interface GongAccessCredentials {
  accessKey: string;
  accessKeySecret: string;
}

// Pagination records
export interface GongPaginationRecords {
  totalRecords: number;
  currentPageSize: number;
  currentPageNumber: number;
  cursor?: string;
}

// Media URLs returned with contentSelector.exposedFields.media
export interface GongCallMedia {
  audioUrl?: string;
  videoUrl?: string;
}

// Call list response (POST /v2/calls/extensive)
export interface GongCallsListResponse {
  requestId: string;
  records: GongPaginationRecords;
  calls: { metaData: GongCall; parties?: GongParty[]; media?: GongCallMedia }[];
}

export interface GongCall {
  id: string;
  url: string;
  title: string;
  scheduled: string; // ISO datetime
  started: string; // ISO datetime
  duration: number; // seconds
  primaryUserId: string;
  direction: "Inbound" | "Outbound" | "Conference" | "Unknown";
  scope: "Internal" | "External" | "Unknown";
  media: "Video" | "Audio";
  language: string;
  workspaceId: string;
  sdrDisposition?: string;
  clientUniqueId?: string;
  customData?: string;
  purpose?: string;
  meetingUrl?: string;
  isPrivate: boolean;
  calendarEventId?: string;
}

export interface GongParty {
  id: string;
  emailAddress?: string;
  name?: string;
  title?: string;
  userId?: string;
  speakerId?: string;
  context?: GongPartyContext[];
  affiliation: "Internal" | "External" | "Unknown";
  phoneNumber?: string;
  methods?: string[];
}

export interface GongPartyContext {
  system: string;
  objects: {
    objectType: string;
    objectId: string;
    fields: unknown[];
  }[];
}

// Transcript response (POST /v2/calls/transcript)
export interface GongTranscriptResponse {
  requestId: string;
  callTranscripts: GongCallTranscript[];
}

export interface GongCallTranscript {
  callId: string;
  transcript: GongTranscriptEntry[];
}

export interface GongTranscriptEntry {
  speakerId: string;
  topic?: string;
  sentences: GongSentence[];
}

export interface GongSentence {
  start: number; // milliseconds
  end: number; // milliseconds
  text: string;
}

// Media response (GET /v2/calls/{id}/media)
export interface GongMediaResponse {
  requestId: string;
  url: string; // Pre-signed URL for video/audio
}

// Call details response (POST /v2/calls/extensive)
export interface GongCallsExtensiveResponse {
  requestId: string;
  records: GongPaginationRecords;
  calls: GongCallExtensive[];
}

export interface GongCallExtensive extends GongCall {
  content?: {
    trackers?: {
      name: string;
      count: number;
      occurrences: {
        startTime: number;
        endTime: number;
      }[];
    }[];
    topics?: {
      name: string;
      duration: number;
    }[];
    pointsOfInterest?: {
      type: string;
      startTime: number;
      endTime: number;
    }[];
  };
  collaboration?: {
    publicComments?: {
      id: string;
      audioStartTime: number;
      audioEndTime: number;
      commenterUserId: string;
      comment: string;
      posted: string;
      inReplyTo?: string;
    }[];
  };
  interaction?: {
    speakers?: {
      id: string;
      userId?: string;
      talkTime: number;
    }[];
    interactivity?: {
      talkRatio: number;
      interactivity: number;
      longestMonologue: number;
    };
    questions?: {
      companyCount: number;
      nonCompanyCount: number;
    };
  };
}
