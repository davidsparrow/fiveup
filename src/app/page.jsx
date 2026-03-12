import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import PageShell from "@/components/fivestarz/PageShell";
import HomePageContent from "@/components/fivestarz/HomePage";

export default async function Home() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    return (
        <>
            <div style={styles.banner}>
                <div style={styles.bannerInner}>
                    <div>
                        <p style={styles.kicker}>Supabase auth is now wired up for testing</p>
                        <p style={styles.copy}>
                            {user
                                ? `Signed in as ${user.email}`
                                : "Create an account or log in to test the real Supabase auth flow."}
                        </p>
                    </div>
                    <div style={styles.actions}>
                        {user ? (
                            <Link href="/account" style={styles.primaryLink}>
                                Go to account
                            </Link>
                        ) : (
                            <>
                                <Link href="/login" style={styles.secondaryLink}>
                                    Log in
                                </Link>
                                <Link href="/signup" style={styles.primaryLink}>
                                    Sign up
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <PageShell>
                <HomePageContent />
            </PageShell>
        </>
    );
}

const styles = {
    banner: {
        background: "#3d2b1f",
        color: "#fff",
        padding: "14px 16px",
    },
    bannerInner: {
        maxWidth: 1100,
        margin: "0 auto",
        display: "flex",
        gap: 16,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
    },
    kicker: {
        margin: 0,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#fdd07a",
        fontWeight: 700,
    },
    copy: {
        margin: "6px 0 0",
        color: "#fff3e4",
        fontWeight: 500,
    },
    actions: {
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
    },
    primaryLink: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 16px",
        borderRadius: 12,
        background: "#ff6b35",
        color: "#fff",
        textDecoration: "none",
        fontWeight: 700,
    },
    secondaryLink: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 16px",
        borderRadius: 12,
        border: "1px solid #a0644a",
        color: "#fff3e4",
        textDecoration: "none",
        fontWeight: 700,
    },
};
