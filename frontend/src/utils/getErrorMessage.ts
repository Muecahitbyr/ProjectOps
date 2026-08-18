import axios from "axios";

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return `Server error (${error.response.status}). Please try again.`;
    }
    if (error.request) {
      return "Could not reach the ProjectOps backend. Is it running?";
    }
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
