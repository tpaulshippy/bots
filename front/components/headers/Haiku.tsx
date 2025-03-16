import { Image } from "react-native";
import { ThemedText } from "../ThemedText";
import { StyleSheet } from "react-native";

export default function HaikuHeader() {
    return (
      <>
        <Image
        source={require("../../assets/images/haiku_small.png")}
        style={{ width: 50, height: 50 }}
      />
        <ThemedText style={styles.headerText}>Haiku AI</ThemedText>
      </>
    )
}

const styles = StyleSheet.create({
    headerText: {
      fontSize: 30,
      fontWeight: "bold",
      marginLeft: 12,
    },
  });