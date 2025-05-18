import 'icloudjs';
import { iCloudDriveService } from 'icloudjs/build/services/drive.js';
import {
  iCloudPhotoAlbum as iCloudPhotoAlbumBase,
  iCloudPhotoAsset as iCloudPhotoAssetBase,
  iCloudPhotosService as iCloudPhotosServiceBase,
} from 'icloudjs/build/services/photos.js';

declare module 'icloudjs' {
  //@ts-expect-error
  interface iCloudPhotoAlbum extends iCloudPhotoAlbumBase {
    getPhotos(): Promise<iCloudPhotoAsset[]>;
  }
  interface iCloudPhotosService extends iCloudPhotosServiceBase {
    getAlbum(
      albumName: string,
      options?: {
        limit?: number;
        offset?: number;
        sortBy?: string;
        sortOrder?: string;
      },
    ): Promise<iCloudPhotoAlbum[]>;
  }

  //@ts-expect-error
  interface iCloudPhotoAsset extends iCloudPhotoAssetBase {
    masterRecord: MasterRecord;
    assetRecord: AssetRecord;
    PHOTO_VERSION_LOOKUP: PHOTOVERSIONLOOKUP;
    VIDEO_VERSION_LOOKUP: PHOTOVERSIONLOOKUP;
    _versions: Versions;
  }

  interface Versions {
    original: Original;
    medium: Original;
    thumb: Original;
  }

  interface Original {
    filename: string;
    width: number;
    height: number;
    size: number;
    url: string;
    type: string;
  }

  interface PHOTOVERSIONLOOKUP {
    original: string;
    medium: string;
    thumb: string;
  }

  interface AssetRecord {
    recordName: string;
    recordType: string;
    fields: Fields2;
    pluginFields: PluginFields;
    recordChangeTag: string;
    created: Created;
    modified: Created;
    deleted: boolean;
    zoneID: ZoneID;
  }

  interface Fields2 {
    assetDate: OriginalOrientation;
    orientation: OriginalOrientation;
    addedDate: OriginalOrientation;
    assetSubtypeV2: OriginalOrientation;
    assetHDRType: OriginalOrientation;
    timeZoneOffset: OriginalOrientation;
    masterRef: MasterRef;
    adjustmentRenderType: OriginalOrientation;
    vidComplDispScale: OriginalOrientation;
    isHidden: OriginalOrientation;
    duration: OriginalOrientation;
    burstFlags: OriginalOrientation;
    assetSubtype: OriginalOrientation;
    vidComplDurScale: OriginalOrientation;
    vidComplDurValue: OriginalOrientation;
    vidComplVisibilityState: OriginalOrientation;
    customRenderedValue: OriginalOrientation;
    isFavorite: OriginalOrientation;
    vidComplDispValue: OriginalOrientation;
  }

  interface MasterRef {
    value: Value2;
    type: string;
  }

  interface Value2 {
    recordName: string;
    action: string;
    zoneID: ZoneID;
  }

  interface MasterRecord {
    recordName: string;
    recordType: string;
    fields: Fields;
    pluginFields: PluginFields;
    recordChangeTag: string;
    created: Created;
    modified: Created;
    deleted: boolean;
    zoneID: ZoneID;
  }

  interface ZoneID {
    zoneName: string;
    ownerRecordName: string;
    zoneType: string;
  }

  interface Created {
    timestamp: number;
    userRecordName: string;
    deviceID: string;
  }

  interface PluginFields {}

  interface Fields {
    itemType: ItemType;
    resJPEGThumbFingerprint: ItemType;
    filenameEnc: ItemType;
    resJPEGMedRes: ResJPEGMedRes;
    originalOrientation: OriginalOrientation;
    resJPEGMedHeight: OriginalOrientation;
    resOriginalRes: ResJPEGMedRes;
    resJPEGMedFileType: ItemType;
    resJPEGThumbHeight: OriginalOrientation;
    resJPEGThumbWidth: OriginalOrientation;
    resOriginalWidth: OriginalOrientation;
    resJPEGThumbFileType: ItemType;
    dataClassType: OriginalOrientation;
    resOriginalFingerprint: ItemType;
    resJPEGMedWidth: OriginalOrientation;
    resJPEGThumbRes: ResJPEGMedRes;
    resOriginalFileType: ItemType;
    resOriginalHeight: OriginalOrientation;
    resJPEGMedFingerprint: ItemType;
  }

  interface OriginalOrientation {
    value: number;
    type: string;
  }

  interface ResJPEGMedRes {
    value: Value;
    type: string;
  }

  interface Value {
    fileChecksum: string;
    size: number;
    wrappingKey: string;
    referenceChecksum: string;
    downloadURL: string;
  }

  interface ItemType {
    value: string;
    type: string;
  }

  interface EndpointService {
    serviceUri: string;
    headers: Headers;
  }

  interface Headers {
    'User-Agent': string;
    Accept: string;
    'Content-Type': string;
    Origin: string;
    Cookie: string;
  }
}
