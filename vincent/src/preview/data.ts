// A fictional company's files, so every kind of row shows up in the preview.
import {
  mdiArchive, mdiCodeTags, mdiFileDocument, mdiFileExcel, mdiFileImage, mdiFileMusic, mdiFilePdfBox, mdiFilePowerpoint, mdiFileVideo, mdiFileWord,
  mdiFolder, mdiFolderAccount, mdiMonitorShare,
} from './icons';

export const COMPANY = 'Fernhill Studio';

// Colours come from theme roles: `folder` is the primary colour, the others its status hues.
export type Tone = 'folder' | 'error' | 'success' | 'info' | 'warning' | 'muted';
export interface Row {
  name: string; ext?: string; icon: string; tone: Tone; type: string; size: string; modified: string;
  shared?: boolean; favorite?: boolean; tags?: string[]; selected?: boolean;
}

export const files: Row[] = [
  { name: 'Backups', icon: mdiMonitorShare, tone: 'folder', type: 'Folder', size: '28.2 MB', modified: '2 weeks ago' },
  { name: 'Brand assets', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '5.9 GB', modified: '3 days ago', favorite: true },
  { name: 'Client projects', icon: mdiFolderAccount, tone: 'folder', type: 'Folder', size: '1.2 TB', modified: '2 days ago', shared: true },
  { name: 'Invoices 2026', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '84 MB', modified: 'Yesterday', tags: ['Finance'] },
  { name: 'Annual report', ext: '.pdf', icon: mdiFilePdfBox, tone: 'error', type: 'PDF document', size: '12.4 MB', modified: '4 hours ago', selected: true, shared: true },
  { name: 'Autumn campaign', ext: '.mp4', icon: mdiFileVideo, tone: 'muted', type: 'MP4 video', size: '842 MB', modified: 'October 2' },
  { name: 'Budget forecast', ext: '.xlsx', icon: mdiFileExcel, tone: 'success', type: 'Excel spreadsheet', size: '1.8 MB', modified: 'Yesterday', favorite: true, tags: ['Finance', 'Draft'] },
  { name: 'Interview with Maya', ext: '.mp3', icon: mdiFileMusic, tone: 'muted', type: 'MP3 audio', size: '46.1 MB', modified: 'September 18' },
  { name: 'Kickoff deck', ext: '.pptx', icon: mdiFilePowerpoint, tone: 'warning', type: 'PowerPoint presentation', size: '23.7 MB', modified: '5 days ago' },
  { name: 'Meeting notes', ext: '.md', icon: mdiFileDocument, tone: 'muted', type: 'Markdown document', size: '4 KB', modified: '12 minutes ago' },
  { name: 'Portrait session', ext: '.jpg', icon: mdiFileImage, tone: 'info', type: 'JPEG image', size: '7.8 MB', modified: 'March 2024' },
  { name: 'Project archive', ext: '.zip', icon: mdiArchive, tone: 'muted', type: 'ZIP archive', size: '3.1 GB', modified: 'July 31' },
  { name: 'Proposal', ext: '.docx', icon: mdiFileWord, tone: 'info', type: 'Word document', size: '86 KB', modified: 'August 4' },
  { name: 'site-config', ext: '.json', icon: mdiCodeTags, tone: 'muted', type: 'JSON file', size: '2 KB', modified: '3 weeks ago' },
];

export const sharedFiles: Row[] = [
  { name: '06-June', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '8.9 GB', modified: 'July 3' },
  { name: '07-July', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '3.1 GB', modified: 'July 31' },
  { name: '08-August', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '4.4 GB', modified: 'September 4' },
  { name: '09-September', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '6.2 GB', modified: 'October 2' },
  { name: 'Contact sheet', ext: '.pdf', icon: mdiFilePdfBox, tone: 'error', type: 'PDF document', size: '18.2 MB', modified: 'October 9' },
  { name: 'Portrait 0054', ext: '.jpg', icon: mdiFileImage, tone: 'info', type: 'JPEG image', size: '6.7 MB', modified: 'March 2024' },
  { name: 'Portrait 0055', ext: '.jpg', icon: mdiFileImage, tone: 'info', type: 'JPEG image', size: '6.5 MB', modified: 'March 2024' },
  { name: 'Portrait 0056', ext: '.jpg', icon: mdiFileImage, tone: 'info', type: 'JPEG image', size: '7.1 MB', modified: 'March 2024' },
  { name: 'Shot list', ext: '.xlsx', icon: mdiFileExcel, tone: 'success', type: 'Excel spreadsheet', size: '142 KB', modified: 'February 2024' },
];
