import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import { apiClient, UnauthorizedError } from "./apiClient";
import { PaginatedResponse } from "./chats";

export interface Device {
  id: number;
  device_id: string;
  notification_token: string;
  notify_on_new_chat: boolean;
  notify_on_new_message: boolean;
  deleted_at: Date | null;
}

export const fetchDevice = async (deviceId: string): Promise<Device | null> => {
  try {
    const { data, ok, status } = await apiClient<Device>(
      "/devices/" + deviceId + ".json"
    );

    if (status === 404) {
      return null;
    }

    if (!ok) {
      throw new Error(`Failed to fetch devices with status ${status}`);
    }
    return data;
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    Sentry.captureException(error);
    return null;
  }
};

export const fetchDeviceByToken = async (
  token: string
): Promise<Device | null> => {
  try {
    const { data, ok, status } = await apiClient<PaginatedResponse<Device>>(
      `/devices/?notificationToken=${token}`
    );

    if (status === 404 || (data && data.results.length === 0)) {
      return null;
    }

    if (!ok || !data) {
      throw new Error(`Failed to fetch device with status ${status}`);
    }
    return data.results[0]; // Return the first device from the list
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    Sentry.captureException(error);
    return null;
  }
};

export const upsertDevice = async (device: Device): Promise<Device | null> => {
  try {
    if (device.id == -1) {
      const { data, ok, status } = await apiClient<Device>("/devices.json", {
        method: "POST",
        body: JSON.stringify(device),
      });

      if (!ok) {
        throw new Error(`Failed to create device with status ${status}`);
      }
      return data;
    }
    const { data, ok, status } = await apiClient<Device>(
      `/devices/${device.id}.json`,
      {
        method: "PUT",
        body: JSON.stringify(device),
      }
    );

    if (!ok) {
      throw new Error(`Failed to update device with status ${status}`);
    }
    return data;
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    Sentry.captureException(error);
    return null;
  }
};

export const getDeviceIdFromStorage = async (): Promise<string | null> => {
  const deviceId = await AsyncStorage.getItem("deviceId");
  return deviceId;
};

export const setDeviceIdInStorage = async (deviceId: string): Promise<void> => {
  AsyncStorage.setItem("deviceId", deviceId);
};
