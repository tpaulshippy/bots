import React, { useState } from 'react';
import { ThemedView } from '@/components/ThemedView';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedText } from '@/components/ThemedText';
import { deleteAccount } from '@/api/account';
import { StyleSheet } from 'react-native';

const DeleteAccountScreen = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDeleteAccount = async () => {
        setLoading(true);
        setError(null);
        try {
            await deleteAccount();
            // Handle successful deletion (e.g., redirect or show a success message)
        } catch (err) {
            setError('Error deleting account.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <ThemedText>Are you sure you want to delete your account? You will lose all data.</ThemedText>
            <ThemedButton style={styles.link} onPress={handleDeleteAccount}>
                <ThemedText>
                    {loading ? 'Deleting...' : 'Confirm Account Deletion'}
                </ThemedText>
            </ThemedButton>
            {error && <ThemedText>{error}</ThemedText>}
        </ThemedView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        gap: 20,
    },
    link: {
        borderRadius: 10,
        padding: 15,
    },
});

export default DeleteAccountScreen;
