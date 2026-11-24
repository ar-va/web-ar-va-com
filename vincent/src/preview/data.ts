// A fictional company's files, so every kind of row shows up in the preview.
import {
  mdiArchive, mdiCodeTags, mdiFileDocument, mdiFileExcel, mdiFileImage, mdiFileMusic, mdiFilePdfBox, mdiFilePowerpoint, mdiFileVideo, mdiFileWord,
  mdiFolder, mdiFolderAccount, mdiMonitorShare,
} from './icons';

export const COMPANY = 'Yellow House Studio';
// The signed-in person, after the painter the tool is named for.
export const PERSON = 'Vincent';

// Folders take the primary colour; Nextcloud's file type icons are fixed images that never follow the theme.
export type Tone = 'folder' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'other';
export interface Row {
  name: string; ext?: string; icon: string; tone: Tone; type: string; size: string; modified: string;
  shared?: boolean; favorite?: boolean; tags?: string[]; selected?: boolean; active?: boolean;
  /** Days since the change: Nextcloud darkens the date of recent files. */
  age: number;
}

export const files: Row[] = [
  { name: 'Backups', icon: mdiMonitorShare, tone: 'folder', type: 'Folder', size: '28.2 MB', modified: '2 weeks ago', age: 14 },
  { name: 'Brand assets', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '5.9 GB', modified: '3 days ago', age: 3, favorite: true },
  { name: 'Client projects', icon: mdiFolderAccount, tone: 'folder', type: 'Folder', size: '1.2 TB', modified: '2 days ago', age: 2, shared: true },
  { name: 'Letters to Theo', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '312 MB', modified: 'Last week', age: 7 },
  { name: 'Invoices 2026', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '84 MB', modified: 'Yesterday', age: 1, tags: ['Finance'] },
  { name: 'Annual report', ext: '.pdf', icon: mdiFilePdfBox, tone: 'pdf', type: 'PDF document', size: '12.4 MB', modified: '4 hours ago', age: 0.17, selected: true, active: true, shared: true },
  { name: 'Autumn campaign', ext: '.mp4', icon: mdiFileVideo, tone: 'other', type: 'MP4 video', size: '842 MB', modified: 'October 2', age: 52 },
  { name: 'Budget forecast', ext: '.xlsx', icon: mdiFileExcel, tone: 'sheet', type: 'Excel spreadsheet', size: '1.8 MB', modified: 'Yesterday', age: 1, favorite: true, tags: ['Finance', 'Draft'] },
  { name: 'Interview with Maya', ext: '.mp3', icon: mdiFileMusic, tone: 'other', type: 'MP3 audio', size: '46.1 MB', modified: 'September 18', age: 66 },
  { name: 'Kickoff deck', ext: '.pptx', icon: mdiFilePowerpoint, tone: 'slides', type: 'PowerPoint presentation', size: '23.7 MB', modified: '5 days ago', age: 5 },
  { name: 'Meeting notes', ext: '.md', icon: mdiFileDocument, tone: 'other', type: 'Markdown document', size: '4 KB', modified: '12 minutes ago', age: 0.01 },
  { name: 'Starry night palette', ext: '.pdf', icon: mdiFilePdfBox, tone: 'pdf', type: 'PDF document', size: '2.6 MB', modified: 'Tuesday', age: 6 },
  { name: 'Sunflowers study', ext: '.jpg', icon: mdiFileImage, tone: 'other', type: 'JPEG image', size: '7.8 MB', modified: 'March 2024', age: 600 },
  { name: 'Project archive', ext: '.zip', icon: mdiArchive, tone: 'other', type: 'ZIP archive', size: '3.1 GB', modified: 'July 31', age: 115 },
  { name: 'Proposal', ext: '.docx', icon: mdiFileWord, tone: 'doc', type: 'Word document', size: '86 KB', modified: 'August 4', age: 111 },
  { name: 'site-config', ext: '.json', icon: mdiCodeTags, tone: 'other', type: 'JSON file', size: '2 KB', modified: '3 weeks ago', age: 21 },
];

export const sharedFiles: Row[] = [
  { name: '06-June', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '8.9 GB', modified: 'July 3', age: 143 },
  { name: '07-July', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '3.1 GB', modified: 'July 31', age: 115 },
  { name: '08-August', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '4.4 GB', modified: 'September 4', age: 80 },
  { name: '09-September', icon: mdiFolder, tone: 'folder', type: 'Folder', size: '6.2 GB', modified: 'October 2', age: 52 },
  { name: 'Contact sheet', ext: '.pdf', icon: mdiFilePdfBox, tone: 'pdf', type: 'PDF document', size: '18.2 MB', modified: 'October 9', age: 45 },
  { name: 'Portrait 0054', ext: '.jpg', icon: mdiFileImage, tone: 'other', type: 'JPEG image', size: '6.7 MB', modified: 'March 2024', age: 600 },
  { name: 'Portrait 0055', ext: '.jpg', icon: mdiFileImage, tone: 'other', type: 'JPEG image', size: '6.5 MB', modified: 'March 2024', age: 600 },
  { name: 'Portrait 0056', ext: '.jpg', icon: mdiFileImage, tone: 'other', type: 'JPEG image', size: '7.1 MB', modified: 'March 2024', age: 600 },
  { name: 'Shot list', ext: '.xlsx', icon: mdiFileExcel, tone: 'sheet', type: 'Excel spreadsheet', size: '142 KB', modified: 'February 2024', age: 640 },
];
