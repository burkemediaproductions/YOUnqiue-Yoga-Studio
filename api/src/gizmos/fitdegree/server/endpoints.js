// api/src/gizmos/fitdegree/server/endpoints.js

/**
 * FitDegree endpoint map.
 *
 * IMPORTANT:
 * - Some code calls endpoints as strings (TEAM_MEMBERS)
 * - Some code calls them as functions (instructors())
 * This file supports BOTH for backwards/forwards compatibility.
 */

export const FITDEGREE_ENDPOINTS = {
  // Canonical string endpoints
  UPCOMING_CLASSES: "/api/v1/UPCOMING_CLASSES",
  TEAM_MEMBERS: "/api/v1/TEAM_MEMBERS",

  // Friendly string aliases (in case router references these)
  upcomingClasses: "/api/v1/UPCOMING_CLASSES",
  instructors: "/api/v1/TEAM_MEMBERS",
  teamMembers: "/api/v1/TEAM_MEMBERS",

  // Function aliases (in case router calls them like endpoints.instructors())
  upcoming_classes() {
    return "/api/v1/UPCOMING_CLASSES";
  },
  classes() {
    return "/api/v1/UPCOMING_CLASSES";
  },
  instructorsFn() {
    return "/api/v1/TEAM_MEMBERS";
  },
  instructors() {
    return "/api/v1/TEAM_MEMBERS";
  },
  team_members() {
    return "/api/v1/TEAM_MEMBERS";
  },
  teamMembersFn() {
    return "/api/v1/TEAM_MEMBERS";
  },
};
