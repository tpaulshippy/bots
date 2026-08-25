import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import { request, requestRaw, PaginatedResponse } from "./request";

export interface Device {
  id: number;
  device_id: string;
  notification_token: string;
  notify_on_new_chat: boolean;
  notify_on_new_message: boolean;
  notify_digest_only: boolean;
  deleted_at: Date | null;
}

export const fetchDevice = async (deviceId: string): Promise<Device | null> => {
  const response = await requestRaw<Device>("/devices/" + deviceId + ".json");

  if (!response || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    Sentry.captureException(
      new Error(`Failed to fetch devices with status ${response.status}`)
    );
    return null;
  }
  return response.data;
};

export const fetchDeviceByToken = async (
  token: string
): Promise<Device | null> => {
  const response = await requestRaw<PaginatedResponse<Device>>(
    `/devices/?notificationToken=${token}`
  );

  if (!response) {
    return null;
  }

  const { data, ok, status } = response;
  if (status === 404 || (data && data.results.length === 0)) {
    return null;
  }

  if (!ok || !data) {
    Sentry.captureException(
      new Error(`Failed to fetch device with status ${status}`)
    );
    return null;
  }
  return data.results[0]; // Return the first device from the list
};

export const upsertDevice = async (device: Device): Promise<Device | null> => {
  if (device.id === -1) {
    return request<Device | null>("/devices.json", {
      method: "POST",
      body: JSON.stringify(device),
    }, null);
  }
  return request<Device | null>(`/devices/${device.id}.json`, {
    method: "PUT",
    body: JSON.stringify(device),
  }, null);
};

export const getDeviceIdFromStorage = async (): Promise<string | null> => {
  const deviceId = await AsyncStorage.getItem("deviceId");
  return deviceId;
};

export const setDeviceIdInStorage = async (deviceId: string): Promise<void> => {
  AsyncStorage.setItem("deviceId", deviceId);
};
