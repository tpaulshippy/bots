import SyftHeader from "../components/headers/Syft";
import HaikuHeader from "../components/headers/Haiku";

interface IConfig {
    [key: string]: {
        name: string;
        id: number;
        headerComponent: React.ComponentType;
        settings: string[];
        showRestrictions: boolean;
    };
}

export const DefaultAppName = "Haiku";

export default function Config() {
    return {
        "Syft": {
            "name": "Syft",
            "id": 1,
            "headerComponent": SyftHeader,
            "settings": [
                "Profiles",
                "Bots",
                "Notifications",
                "Subscription",
                "Set Pin",
                "Terms of Use and Privacy Policy",
                "Delete Account",
                "Log Out"
            ],
            "showRestrictions": true,
            "showAiModels": true
        },
        "Haiku": {
            "name": "Haiku",
            "id": 2,
            "headerComponent": HaikuHeader,
            "settings": [
                "Bots",
                "Subscription",
                "Terms of Use and Privacy Policy",
                "Delete Account",
                "Log Out"
            ],
            "showRestrictions": false,
            "showAiModels": false
        }
    } as IConfig;
}