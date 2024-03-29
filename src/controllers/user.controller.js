import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";


const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});

        return { accessToken, refreshToken };
        
    } catch (error) {
        throw new ApiError(500, "Something weng wrong while generating access and refresh tokens")
    }
}


const registerUser = asyncHandler( async (req, res) => {
    // ---------get user details from frontend---------
    const { fullName, email, username, password } = req.body;
    console.log(fullName, ' ', email, ' ', password, );

    // ---------validation - not empty----------

    // if (fullName === "") {
    //     throw new ApiError(400, "fullname is required")
    // }
    if (
        [ fullName, email, username, password ].some((field)=> field?.trim() === "")
    ) {
        throw new ApiError(400, "fullname is required")
    }

    // ---------check if user already exists--------
    const existedUser = await User.findOne({
        $or: [{ email }]
    })
    if (existedUser) {
        throw new ApiError(409, "User with email already exists")
    }

    // ---------check for images, check for avatar----------
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;
    if(!avatarLocalPath) throw new ApiError(400, "Avatar is required");

    // ---------upload them to cloudinary, avatar--------
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if(!avatar) throw new ApiError(400, "Avatar is required");
    
    // ---------create user object - create entry in db----------
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
    })

    // ---------remove pass and refresh token field from response---------
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    // ---------check for user creation response-----------
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    // ---------return res-----------
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User created successfully")
    )

})

const loginUser = asyncHandler( async (req, res) => {
    // take data from req.body
    const {email, username, password} = req.body;

    // username or email
    if(!username && !email){
        throw new ApiError(400, "Username or email is required")
    }

    // find the user
    const user = await User.findOne({
        $or: [
            {username},
            {email}
        ]
    })
    if(!user){
        throw new ApiError(404, "User doesn't exist")
    }

    // if user check password
    const isPasswordValid =  await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials")
    }

    // access and refresh token
    const {accessToken, refreshToken} =  await generateAccessAndRefreshTokens(user._id);

    // send cookie
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    const options = {
        httpOnly: true,
        secure: true
    }
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200, 
            {
            user: loggedInUser,
            accessToken,
            refreshToken
            },
            "User Logged in successfully"
        )
    )
})

const logoutUser = asyncHandler( async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: true
    }
    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
        new ApiResponse(200, {}, "User Logged Out")
    )
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET,
        )
    
        const user = await User.findById(decodedToken?._id);
        if (!user) {
            throw new ApiError(401, "invalid refresh token");
        }
    
        if (incomingRefreshToken !== user?.refreshAccessToken) {
            throw new ApiError(401, "refresh token expired or used");
        }
    
        const options = {
            httpOnly: true,
            secure: true,
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

export { registerUser, loginUser, logoutUser, refreshAccessToken }
