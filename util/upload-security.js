const Crypto = require("crypto");
const FS = require("fs");
const Path = require("path");
const multer = require("multer");

const Config = require("../config/wotlwedu");
const UUID = require("./mini-uuid");
const StatusResponse = require("./statusresponse");

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": {
    extensions: new Set(["jpg", "jpeg"]),
    matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  "image/png": {
    extensions: new Set(["png"]),
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a,
  },
};

function configuredUploadLimitBytes() {
  const parsed = Number(Config.uploadMaxBytes);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5 * 1024 * 1024;
  return Math.floor(parsed);
}

function sanitizeFileExtension(value, fallback = "jpg") {
  const normalized = (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
  if (["jpg", "jpeg", "png"].includes(normalized)) return normalized;
  return fallback;
}

function sanitizeFileStem(value) {
  const normalized = (value || "")
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return normalized || UUID("file");
}

function sniffImageType(buffer) {
  for (const [mimeType, definition] of Object.entries(ALLOWED_IMAGE_TYPES)) {
    if (definition.matches(buffer)) return mimeType;
  }
  return null;
}

function removeUploadedFile(file) {
  if (!file?.path) return;
  try {
    FS.unlinkSync(file.path);
  } catch (err) {
    console.log("Failed to remove rejected upload: " + err.message);
  }
}

const imageFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    FS.mkdirSync(Config.imageDir, { recursive: true });
    cb(null, Config.imageDir);
  },
  filename: (req, file, cb) => {
    const requestedExtension = sanitizeFileExtension(
      req.body?.fileextension || Path.extname(file.originalname || "")
    );
    const stem = sanitizeFileStem(req.params?.imageId);
    const randomSuffix = Crypto.randomBytes(4).toString("hex");
    cb(null, `${stem}-${randomSuffix}.${requestedExtension}`);
  },
});

function imageFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
    return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "imageUpload"));
  }
  return cb(null, true);
}

const imageUpload = multer({
  storage: imageFileStorage,
  fileFilter: imageFileFilter,
  limits: {
    files: 1,
    fileSize: configuredUploadLimitBytes(),
  },
});

function validateImageUpload(req, res, next) {
  if (!req.file) return StatusResponse(res, 421, "No image provided");

  let header;
  try {
    const fd = FS.openSync(req.file.path, "r");
    header = Buffer.alloc(16);
    FS.readSync(fd, header, 0, header.length, 0);
    FS.closeSync(fd);
  } catch (err) {
    removeUploadedFile(req.file);
    return next(err);
  }

  const detectedMimeType = sniffImageType(header);
  const declaredType = ALLOWED_IMAGE_TYPES[req.file.mimetype];
  const extension = sanitizeFileExtension(Path.extname(req.file.filename || ""));
  const extensionAllowed = declaredType?.extensions?.has(extension);

  if (!detectedMimeType || detectedMimeType !== req.file.mimetype || !extensionAllowed) {
    removeUploadedFile(req.file);
    return StatusResponse(res, 421, "Invalid image file");
  }

  req.file.detectedMimeType = detectedMimeType;
  return next();
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  configuredUploadLimitBytes,
  imageUpload,
  removeUploadedFile,
  sanitizeFileExtension,
  sanitizeFileStem,
  sniffImageType,
  validateImageUpload,
};
