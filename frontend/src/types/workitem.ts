/**
 * A ServiceNow work item displayed in the dashboard worklog.
 */
export interface WorkItem {
  type: 'incident' | 'change' | 'task' | 'ritm' | 'problem';
  number: string;
  shortDescription: string;
  priority: number;
  state: string;
  openedAt: string;
  dueDate?: string;
  assignedTo: string;
  sysId: string;
}

/**
 * Response from the GET /api/worklog endpoint.
 */
export interface WorklogResponse {
  items: WorkItem[];
  status: string;
}
