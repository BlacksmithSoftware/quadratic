import express, { Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import dbClient from '../../dbClient';
import { userMiddleware, userOptionalMiddleware } from '../../middleware/user';
import { validateAccessToken } from '../../middleware/validateAccessToken';
import { validateOptionalAccessToken } from '../../middleware/validateOptionalAccessToken';
import { Request } from '../../types/Request';
import { fileMiddleware } from './fileMiddleware';
import { getFilePermissions } from './getFilePermissions';
import { generatePresignedUrl, uploadThumbnailToS3 } from './thumbnail';

export const validateUUID = () => param('uuid').isUUID(4);
const validateFileContents = () => body('contents').isString().not().isEmpty();
const validateFileName = () => body('name').isString().not().isEmpty();
const validateFileVersion = () => body('version').isString().not().isEmpty();

const files_router = express.Router();

files_router.get('/', validateAccessToken, userMiddleware, async (req: Request, res) => {
  if (!req.user) {
    return res.status(500).json({ error: { message: 'Internal server error' } });
  }

  // Fetch files owned by the user from the database
  const files = await dbClient.file.findMany({
    where: {
      ownerUserId: req.user.id,
      deleted: false,
    },
    select: {
      uuid: true,
      name: true,
      thumbnail: true,
      created_date: true,
      updated_date: true,
      public_link_access: true,
    },
    orderBy: [
      {
        updated_date: 'desc',
      },
    ],
  });

  // get signed images for each file thumbnail using S3Client
  await Promise.all(
    files.map(async (file) => {
      if (file.thumbnail) {
        file.thumbnail = await generatePresignedUrl(file.thumbnail);
      }
    })
  );

  return res.status(200).json(files);
});

files_router.get(
  '/:uuid',
  validateUUID(),
  validateOptionalAccessToken,
  userOptionalMiddleware,
  fileMiddleware,
  async (req: Request, res: Response) => {
    if (!req.quadraticFile) {
      return res.status(500).json({ error: { message: 'Internal server error' } });
    }

    // Validate request parameters
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (req.quadraticFile.thumbnail) {
      req.quadraticFile.thumbnail = await generatePresignedUrl(req.quadraticFile.thumbnail);
    }

    return res.status(200).json({
      file: {
        uuid: req.quadraticFile.uuid,
        name: req.quadraticFile.name,
        created_date: req.quadraticFile.created_date,
        updated_date: req.quadraticFile.updated_date,
        version: req.quadraticFile.version,
        contents: req.quadraticFile.contents.toString('utf8'),
        thumbnail: req.quadraticFile.thumbnail,
      },
      permission: getFilePermissions(req.user, req.quadraticFile),
    });
  }
);

files_router.post(
  '/:uuid',
  validateUUID(),
  validateAccessToken,
  userMiddleware,
  fileMiddleware,
  validateFileContents().optional(),
  validateFileVersion().optional(),
  validateFileName().optional(),
  async (req: Request, res: Response) => {
    if (!req.quadraticFile || !req.user) {
      return res.status(500).json({ error: { message: 'Internal server error' } });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // ensure the user has EDIT access to the file
    const permissions = getFilePermissions(req.user, req.quadraticFile);
    if (permissions !== 'EDITOR' && permissions !== 'OWNER') {
      return res.status(403).json({ error: { message: 'Permission denied' } });
    }

    // Update the contents
    if (req.body.contents !== undefined) {
      if (req.body.version === undefined) {
        return res.status(400).json({ error: { message: 'Updating `contents` requires `version` in body' } });
      }

      const contents = Buffer.from(req.body.contents, 'utf-8');
      await dbClient.file.update({
        where: {
          uuid: req.params.uuid,
        },
        data: {
          contents,
          updated_date: new Date(),
          version: req.body.version,
          times_updated: {
            increment: 1,
          },
        },
      });
    }

    // update the file name
    if (req.body.name !== undefined) {
      await dbClient.file.update({
        where: {
          uuid: req.params.uuid,
        },
        data: {
          name: req.body.name,
        },
      });
    }

    return res.status(200).json({ message: 'File updated.' });
  }
);

files_router.post(
  '/:uuid/thumbnail',
  validateUUID(),
  validateAccessToken,
  userMiddleware,
  fileMiddleware,
  uploadThumbnailToS3.single('thumbnail'),
  async (req: Request, res: Response) => {
    // update file object with S3 thumbnail URL
    if (!req.quadraticFile || !req.user) {
      return res.status(500).json({ error: { message: 'Internal server error' } });
    }

    const permissions = getFilePermissions(req.user, req.quadraticFile);

    if (permissions !== 'OWNER') {
      return res.status(403).json({ error: { message: 'Permission denied' } });
    }

    // update the file object with the thumbnail URL
    await dbClient.file.update({
      where: {
        uuid: req.params.uuid,
      },
      data: {
        thumbnail: req.file.key,
      },
    });

    return res.status(200).json({ message: 'Preview updated' });
  }
);

files_router.delete(
  '/:uuid',
  validateUUID(),
  validateAccessToken,
  userMiddleware,
  fileMiddleware,
  async (req: Request, res: Response) => {
    // Validate request format
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.quadraticFile || !req.user) {
      return res.status(500).json({ error: { message: 'Internal server error' } });
    }

    const permissions = getFilePermissions(req.user, req.quadraticFile);
    if (permissions !== 'OWNER') {
      return res.status(403).json({ error: { message: 'Permission denied' } });
    }

    // Delete the file from the database
    await dbClient.file.update({
      where: {
        uuid: req.params.uuid,
      },
      data: {
        deleted: true,
        deleted_date: new Date(),
      },
    });

    return res.status(200).json({ message: 'File deleted' });
  }
);

files_router.post(
  '/',
  validateAccessToken,
  userMiddleware,
  validateFileContents(),
  validateFileVersion(),
  validateFileName(),
  async (req: Request, res) => {
    // POST creates a new file with the provided name, contents, and version

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(500).json({ error: { message: 'Internal server error' } });
    }

    const contents = Buffer.from(req.body.contents, 'utf8');

    const file = await dbClient.file.create({
      data: {
        ownerUserId: req.user.id,
        name: req.body.name,
        contents: contents,
        version: req.body.version,
      },
      select: {
        uuid: true,
        name: true,
        created_date: true,
        updated_date: true,
      },
    });

    return res.status(201).json(file); // CREATED
  }
);

export default files_router;