import { Image } from "react-native";

export default function SyftHeader() {
    return (
        <Image
        source={require("../../assets/images/syft_small.png")}
        style={{ width: 260, height: 35 }}
      />
    )
}