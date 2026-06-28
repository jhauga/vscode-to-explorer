/**
 * Built-in default extension lists for the extension.
 *
 * Extensions are stored without a leading dot and in lowercase. They are
 * normalized again at read time so user-supplied values with or without a dot
 * both work.
 */

/**
 * File extensions opened in their OS default application when double-clicked in
 * the Explorer. The list targets media, design, document, and CAD/3D formats
 * that VS Code cannot edit natively. Plain-text and source formats are
 * deliberately excluded so code keeps opening in the editor.
 */
export const DEFAULT_FILE_EXTENSIONS: string[] = [
  // Adobe Photoshop / Illustrator / InDesign and Creative Cloud projects.
  "ai",
  "ait",
  "psd",
  "psdt",
  "psb",
  "indd",
  "indt",
  "idml",
  "aep",
  "aepx",
  "prproj",
  "prel",
  "xd",
  "fla",

  // Video containers and editing project files.
  "mov",
  "mp4",
  "mkv",
  "avi",
  "wmv",
  "webm",
  "m4v",
  "flv",
  "mpg",
  "mpeg",
  "drp",
  "kdenlive",

  // Audio files and audio-editing projects (Audacity, Ardour).
  "wav",
  "mp3",
  "flac",
  "aac",
  "ogg",
  "m4a",
  "wma",
  "aiff",
  "aup3",
  "aup",
  "ardour",

  // Desktop publishing (Scribus).
  "sla",
  "scd",

  // Image editing and texture formats (GIMP, Krita, Paint.NET, etc.). Common
  // web/preview formats (png, jpg, gif, webp, svg) are intentionally omitted so
  // VS Code keeps previewing them inline.
  "xcf",
  "kra",
  "pdn",
  "cpt",
  "tif",
  "tiff",
  "bmp",
  "tga",
  "dds",
  "exr",
  "hdr",
  "heic",
  "heif",
  "svgz",
  "cr2",
  "cr3",
  "nef",
  "arw",
  "dng",
  "orf",
  "raf",
  "rw2",

  // Motion graphics and 3D animation (Blender, Cinema 4D, Houdini, Nuke).
  "blend",
  "blend1",
  "c4d",
  "hip",
  "hiplc",
  "hipnc",
  "nk",
  "mogrt",

  // Game engines (Unreal, Unity packages).
  "uasset",
  "umap",
  "unitypackage",

  // Mechanical CAD and 3D interchange formats.
  "sldprt",
  "sldasm",
  "catpart",
  "catproduct",
  "ipt",
  "iam",
  "prt",
  "asm",
  "f3d",
  "dwg",
  "dxf",
  "dwf",
  "glb",
  "gltf",
  "fbx",
  "obj",
  "3mf",
  "jt",
  "iges",
  "igs",
  "stl",
  "step",
  "stp",
  "3dm",
  "x_t",
  "x_b",
  "sat",
  "skp",
  "rvt",
  "rfa",
  "dgn",
  "par",
  "psm",
  "model",
  "neu",
  "dae",
  "ply",
  "wrl",
  "vrml",
  "usd",
  "usda",
  "usdc",
  "usdz",
  "abc",
  "3ds",

  // Office documents and spreadsheets (Microsoft Office, LibreOffice).
  "doc",
  "docx",
  "dot",
  "dotx",
  "dotm",
  "ppt",
  "pptx",
  "pps",
  "ppsx",
  "potx",
  "potm",
  "xls",
  "xlsx",
  "xlsm",
  "xltx",
  "xltm",
  "pub",
  "vsd",
  "vsdx",
  "vsdm",
  "mpp",
  "accdb",
  "mdb",
  "one",
  "odt",
  "ods",
  "odp",
  "odg",
  "rtf",
];

/**
 * Extensions treated as runnable scripts for the "Execute Script" command. The
 * Explorer menu uses a static pattern, while the command handler validates
 * against this list (which the user can extend in settings).
 */
export const DEFAULT_SCRIPT_EXTENSIONS: string[] = [
  "bat",
  "cmd",
  "ps1",
  "sh",
  "bash",
  "zsh",
  "ksh",
  "fish",
  "command",
  "py",
  "pl",
  "rb",
];
