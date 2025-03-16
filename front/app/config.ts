import SyftHeader from "../components/headers/Syft";
import HaikuHeader from "../components/headers/Haiku";

export interface IConfig {
    [key: string]: {
        name: string;
        headerComponent: React.ComponentType;
        settings: string[];
    };
}

export default function Config() {
    return {
        "Syft": {
            "name": "Syft",
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
            ]
        },
        "Haiku": {
            "name": "Haiku",
            "headerComponent": HaikuHeader,
            "settings": [
                "Bots",
                "Subscription",
                "Terms of Use and Privacy Policy",
                "Delete Account",
                "Log Out"
            ]
        }
    } as IConfig;
}