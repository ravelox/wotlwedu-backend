const Crypto = require("crypto");
const FS = require("fs");
const Path = require("path");

const Config = require("../config/wotlwedu");

function trimSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function ensureTrailingSlash(value) {
  const text = String(value || "");
  return text.endsWith("/") ? text : `${text}/`;
}

function safeKeyPart(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return normalized || fallback;
}

function extensionForContentType(contentType) {
  if (contentType === "image/png") return "png";
  return "jpg";
}

function createObjectKey(imageId, contentType) {
  const prefix = trimSlashes(Config.mediaStorageKeyPrefix || "pictures")
    .split("/")
    .filter(Boolean)
    .map((part) => safeKeyPart(part, "media"))
    .join("/");
  const stem = safeKeyPart(imageId, "image");
  const suffix = Crypto.randomBytes(8).toString("hex");
  const extension = extensionForContentType(contentType);
  return `${prefix}/${stem}-${suffix}.${extension}`;
}

function getPublicUrl(objectKey) {
  if (!objectKey) return null;
  const publicBaseUrl = Config.mediaStoragePublicBaseUrl || Config.imageURL;
  return `${ensureTrailingSlash(publicBaseUrl)}${String(objectKey).replace(/^\/+/, "")}`;
}

class LocalMediaStorageProvider {
  constructor() {
    this.name = "local";
  }

  resolvePath(objectKey) {
    const basePath = Path.resolve(Config.imageDir);
    const relativeKey = String(objectKey || "").replace(/^\/+/, "");
    const targetPath = Path.resolve(basePath, relativeKey);
    if (targetPath !== basePath && !targetPath.startsWith(basePath + Path.sep)) {
      throw new Error("Invalid media object key");
    }
    return targetPath;
  }

  async putObject({ objectKey, body }) {
    const targetPath = this.resolvePath(objectKey);
    await FS.promises.mkdir(Path.dirname(targetPath), { recursive: true });
    await FS.promises.writeFile(targetPath, body);
    return { objectKey };
  }

  async deleteObject(objectKey) {
    if (!objectKey) return false;
    try {
      await FS.promises.unlink(this.resolvePath(objectKey));
      return true;
    } catch (err) {
      if (err.code === "ENOENT") return false;
      throw err;
    }
  }

  async copyObject(sourceKey, destinationKey) {
    if (!sourceKey || !destinationKey) return false;
    const sourcePath = this.resolvePath(sourceKey);
    const destinationPath = this.resolvePath(destinationKey);
    try {
      await FS.promises.mkdir(Path.dirname(destinationPath), { recursive: true });
      await FS.promises.copyFile(sourcePath, destinationPath);
      return true;
    } catch (err) {
      if (err.code === "ENOENT") return false;
      throw err;
    }
  }
}

class S3CompatibleMediaStorageProvider {
  constructor() {
    this.name = "s3";
    if (!Config.s3Bucket) {
      throw new Error("WOTLWEDU_S3_BUCKET is required when WOTLWEDU_MEDIA_STORAGE_PROVIDER=s3");
    }
    const { S3Client } = require("@aws-sdk/client-s3");
    const endpoint = Config.s3Endpoint
      ? Config.s3Endpoint.replace(/^https?:\/\//, Config.s3Tls ? "https://" : "http://")
      : undefined;
    this.bucket = Config.s3Bucket;
    this.client = new S3Client({
      endpoint,
      region: Config.s3Region,
      forcePathStyle: Config.s3ForcePathStyle,
      credentials:
        Config.s3AccessKeyId && Config.s3SecretAccessKey
          ? {
              accessKeyId: Config.s3AccessKeyId,
              secretAccessKey: Config.s3SecretAccessKey,
            }
          : undefined,
    });
  }

  async putObject({ objectKey, body, contentType, metadata }) {
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      })
    );
    return { objectKey };
  }

  async deleteObject(objectKey) {
    if (!objectKey) return false;
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      })
    );
    return true;
  }

  async copyObject(sourceKey, destinationKey, contentType) {
    if (!sourceKey || !destinationKey) return false;
    const { CopyObjectCommand } = require("@aws-sdk/client-s3");
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: destinationKey,
        CopySource: `${this.bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, "/")}`,
        ContentType: contentType,
        MetadataDirective: contentType ? "REPLACE" : "COPY",
      })
    );
    return true;
  }
}

function createProvider() {
  if (Config.mediaStorageProvider === "s3" || Config.mediaStorageProvider === "s3-compatible") {
    return new S3CompatibleMediaStorageProvider();
  }
  return new LocalMediaStorageProvider();
}

let provider;

function getProvider() {
  if (!provider) provider = createProvider();
  return provider;
}

function resetProviderForTests() {
  provider = null;
}

module.exports = {
  createObjectKey,
  getProvider,
  getPublicUrl,
  resetProviderForTests,
};
