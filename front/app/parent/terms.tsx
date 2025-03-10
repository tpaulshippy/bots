import React from 'react';
import { Linking, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedText } from '@/components/ThemedText';

export default function TermsScreen() {
    return (
        <ThemedView style={styles.container}>
            <ThemedButton style={styles.link} onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>
                <ThemedText>Terms of Use</ThemedText>
            </ThemedButton>
            <ThemedButton style={styles.link} onPress={() => Linking.openURL('https://www.freeprivacypolicy.com/live/6f20c0b8-408b-481d-a474-d3f589746d7b')}>
                <ThemedText>Privacy Policy</ThemedText>
            </ThemedButton>
        </ThemedView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    link: {
        marginBottom: 20,
        borderRadius: 10,
        padding: 15,
    },
});
